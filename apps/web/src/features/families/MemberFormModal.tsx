import { zodResolver } from '@hookform/resolvers/zod';
import { type FamilyMember, GENDERS, type Gender, type MemberInput, RELATIONS, type Relation, memberInputSchema } from '@samaj/shared';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Checkbox, Chip, Input, Modal, toast } from '@/components/ui';
import { Phone } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useSaveMember } from './api';
import { PhotoField } from './PhotoField';

const FIELDS = ['name', 'relation', 'gender', 'birthYear', 'occupation', 'education', 'phone'] as const;

/** The gender most relations imply, so picking "Son" fills it in. Spouse is the opposite of the head. */
const RELATION_GENDER: Partial<Record<Relation, Gender>> = {
  son: 'male',
  father: 'male',
  brother: 'male',
  grandson: 'male',
  sonInLaw: 'male',
  daughter: 'female',
  mother: 'female',
  sister: 'female',
  granddaughter: 'female',
  daughterInLaw: 'female',
};

/** Shown first; the rest are one tap away. */
const COMMON_RELATIONS: Relation[] = ['spouse', 'son', 'daughter', 'father', 'mother', 'daughterInLaw'];

function toFormValues(member: FamilyMember | null, relation?: Relation): MemberInput {
  return {
    name: member?.name ?? '',
    relation: member?.relation ?? relation ?? ('' as MemberInput['relation']),
    gender: member?.gender ?? (relation ? (RELATION_GENDER[relation] ?? '') : '') as MemberInput['gender'],
    birthYear: member?.birthYear ? String(member.birthYear) : '',
    occupation: member?.occupation ?? '',
    education: member?.education ?? '',
    phone: member?.phone ?? '',
  };
}

interface MemberFormModalProps {
  familyId: string;
  /** null to add a new member. */
  member: FamilyMember | null;
  open: boolean;
  onClose: () => void;
  /** Adding: start with this relation picked (from "Add son" and the like). */
  initialRelation?: Relation;
  /** For "spouse": the head's gender, so the spouse's can be filled in. */
  headGender?: Gender;
}

export function MemberFormModal({ familyId, member, open, onClose, initialRelation, headGender }: MemberFormModalProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const save = useSaveMember(familyId);
  const form = useForm({ resolver: zodResolver(memberInputSchema), defaultValues: toFormValues(member, initialRelation) });
  const { errors } = form.formState;
  // Adding someone: the person adding them confirms consent (or guardianship, for a child).
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  // Once someone picks a gender themselves, a later relation choice doesn't overwrite it.
  const genderChosen = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const addAnother = useRef(false);

  const reset = () => {
    form.reset(toFormValues(member, initialRelation));
    save.reset();
    setConsent(false);
    setConsentMissing(false);
    genderChosen.current = Boolean(member);
    setShowAll(Boolean(member && !COMMON_RELATIONS.includes(member.relation)));
  };

  // Refill the form whenever the modal opens for a different person.
  useEffect(() => {
    if (open) reset();
    // Only when the modal opens or switches person; resetting on every render would wipe typing.
  }, [open, member?.id, initialRelation]);

  const isHead = member?.isHead ?? false;
  const phoneLocked = member?.hasAccount ?? false;
  const relations = RELATIONS.filter((r) => (isHead ? r === 'head' : r !== 'head'));
  const showBanner = save.isError && !FIELDS.some((f) => errors[f]?.type === 'server');
  const relation = form.watch('relation');
  const gender = form.watch('gender');
  const birthYear = form.watch('birthYear');
  const age = /^\d{4}$/.test(String(birthYear ?? '')) ? new Date().getFullYear() - Number(birthYear) : null;

  const pickRelation = (r: Relation) => {
    form.setValue('relation', r, { shouldValidate: form.formState.isSubmitted });
    const implied = r === 'spouse' ? (headGender === 'male' ? 'female' : headGender === 'female' ? 'male' : undefined) : RELATION_GENDER[r];
    if (implied && !genderChosen.current) form.setValue('gender', implied, { shouldValidate: form.formState.isSubmitted });
  };
  const pickGender = (g: Gender) => {
    genderChosen.current = true;
    form.setValue('gender', g, { shouldValidate: form.formState.isSubmitted });
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!member && !consent) {
      setConsentMissing(true);
      return;
    }
    save.mutate(
      { memberId: member?.id ?? null, input: member ? values : { ...values, consent: true } },
      {
        onSuccess: ({ family }) => {
          // Added to a verified family by the family itself: they wait for the committee.
          const waits = !member && family.members.some((m) => m.name === values.name && m.approval === 'pending');
          toast.success(t(member ? 'family.memberSaved' : waits ? 'family.memberAddedPending' : 'family.memberAdded', { name: values.name }));
          if (addAnother.current && !member) {
            // Straight on to the next person, with nothing carried over but the family.
            form.reset(toFormValues(null));
            setConsent(false);
            genderChosen.current = false;
            form.setFocus('name');
          } else {
            onClose();
          }
        },
        onError: (err) => applyServerIssues(err, FIELDS, form.setError),
      },
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? t('family.editMemberTitle', { name: member.name }) : t('family.addMemberTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {!member && (
            <Button type="submit" form="member-form" variant="secondary" loading={save.isPending && addAnother.current} onClick={() => (addAnother.current = true)}>
              {t('member.saveAndAdd')}
            </Button>
          )}
          <Button type="submit" form="member-form" loading={save.isPending && !addAnother.current} onClick={() => (addAnother.current = false)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {member && <PhotoField familyId={familyId} memberId={member.id} name={member.name} photoUrl={member.photoUrl} />}
        <form id="member-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {showBanner && <FormAlert message={errorMessage(save.error)} />}

          <Input label={t('member.name')} autoComplete="off" error={fieldError(t, errors.name?.message)} {...form.register('name')} />

          {!isHead && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t('member.relation')}</legend>
              <div className="flex flex-wrap gap-2">
                {relations
                  .filter((r) => showAll || COMMON_RELATIONS.includes(r) || r === relation)
                  .map((r) => (
                    <Chip key={r} selected={relation === r} onClick={() => pickRelation(r)} className="px-3">
                      {t(`relation.${r}`)}
                    </Chip>
                  ))}
                {!showAll && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                    {t('member.moreRelations')}
                  </Button>
                )}
              </div>
              {errors.relation && (
                <p role="alert" className="text-sm text-danger">
                  {fieldError(t, errors.relation.message)}
                </p>
              )}
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-fg">{t('member.gender')}</legend>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <Chip key={g} selected={gender === g} onClick={() => pickGender(g)} className="px-4">
                  {t(`gender.${g}`)}
                </Chip>
              ))}
            </div>
            {errors.gender && (
              <p role="alert" className="text-sm text-danger">
                {fieldError(t, errors.gender.message)}
              </p>
            )}
          </fieldset>

          <Input
            label={t('member.birthYear')}
            labelSuffix={t('common.optional')}
            hint={age !== null && age >= 0 && age < 120 ? t('member.ageIs', { age: formatNumber(age, language) }) : t('member.birthYearHint')}
            inputMode="numeric"
            maxLength={4}
            error={fieldError(t, errors.birthYear?.message)}
            {...form.register('birthYear')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t('member.occupation')} labelSuffix={t('common.optional')} error={fieldError(t, errors.occupation?.message)} {...form.register('occupation')} />
            <Input label={t('member.education')} labelSuffix={t('common.optional')} error={fieldError(t, errors.education?.message)} {...form.register('education')} />
          </div>
          <Input
            label={t('member.phone')}
            labelSuffix={phoneLocked ? undefined : t('common.optional')}
            hint={phoneLocked ? t('member.phoneLocked') : t('member.phoneHint')}
            type="tel"
            inputMode="numeric"
            leadingIcon={Phone}
            readOnly={phoneLocked}
            error={fieldError(t, errors.phone?.message)}
            {...form.register('phone')}
          />
          {!member && (
            <Checkbox
              label={t('privacy.consentMember')}
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setConsentMissing(false);
              }}
              error={consentMissing ? t('validation.consentRequired') : undefined}
            />
          )}
        </form>
      </div>
    </Modal>
  );
}
