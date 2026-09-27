import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADOPTABLE_RELATIONS,
  CHILD_RELATIONS,
  type FamilyMember,
  GENDERS,
  type Gender,
  type MemberInput,
  PARENT_CHOICES,
  PARTNER_CHOICES,
  RELATIONS,
  type Relation,
  SPOUSE_RELATIONS,
  memberInputSchema,
} from '@samaj/shared';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Checkbox, Chip, Input, Modal, toast } from '@/components/ui';
import { Phone } from '@/components/ui/icons';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useSaveMember } from './api';
import { PhotoField } from './PhotoField';

const FIELDS = ['name', 'relation', 'gender', 'birthYear', 'occupation', 'education', 'phone', 'deceased', 'deathYear', 'parentId', 'partnerId', 'adopted', 'otherParentId', 'formerPartner'] as const;

/** The gender most relations imply, so picking "Son" fills it in. Spouse is the opposite of the head. */
const RELATION_GENDER: Partial<Record<Relation, Gender>> = {
  son: 'male',
  father: 'male',
  grandfather: 'male',
  greatGrandfather: 'male',
  uncle: 'male',
  maternalUncle: 'male',
  grandsonInLaw: 'male',
  brother: 'male',
  grandson: 'male',
  greatGrandson: 'male',
  nephew: 'male',
  sonInLaw: 'male',
  daughter: 'female',
  mother: 'female',
  grandmother: 'female',
  greatGrandmother: 'female',
  aunt: 'female',
  paternalAunt: 'female',
  maternalUncleWife: 'female',
  maternalAunt: 'female',
  granddaughterInLaw: 'female',
  sister: 'female',
  granddaughter: 'female',
  greatGranddaughter: 'female',
  niece: 'female',
  sisterInLaw: 'female',
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
    deceased: member?.deceased ?? false,
    deathYear: member?.deathYear ? String(member.deathYear) : '',
    parentId: member?.parentId ?? '',
    partnerId: member?.partnerId ?? '',
    adopted: member?.adopted ?? false,
    otherParentId: member?.otherParentId ?? '',
    formerPartner: member?.formerPartner ?? false,
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
  /** The family's people, to choose whose child or wife someone is. */
  members: FamilyMember[];
}

export function MemberFormModal({ familyId, member, open, onClose, initialRelation, headGender, members }: MemberFormModalProps) {
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
  const deceased = form.watch('deceased') ?? false;
  const parentId = form.watch('parentId');
  const partnerId = form.watch('partnerId');
  // Who they could be the child or partner of, when the relation leaves it open.
  const optionsFor = (allowed: readonly Relation[] | undefined) => (allowed ? members.filter((m) => m.id !== member?.id && allowed.includes(m.relation)) : []);
  const parentOptions = optionsFor(PARENT_CHOICES[relation]);
  const partnerOptions = optionsFor(PARTNER_CHOICES[relation]);
  const onlyOne = (options: FamilyMember[]) => (options.length === 1 ? (options[0]?.id ?? null) : null);
  // After a second marriage: which of the parent's spouses is this child's other parent.
  const otherParentId = form.watch('otherParentId');
  const theirParent = !CHILD_RELATIONS.includes(relation)
    ? undefined
    : relation === 'son' || relation === 'daughter'
      ? members.find((m) => m.isHead)
      : members.find((m) => m.id === (parentId || onlyOne(parentOptions)));
  const spousesOf = (p: FamilyMember | undefined) =>
    p
      ? members.filter((m) => {
          if (m.id === member?.id || !SPOUSE_RELATIONS.includes(m.relation)) return false;
          if (m.partnerId) return m.partnerId === p.id;
          if (m.relation === 'spouse') return p.isHead;
          const whose = PARTNER_CHOICES[m.relation];
          return Boolean(whose?.includes(p.relation)) && members.filter((x) => whose?.includes(x.relation)).length === 1;
        })
      : [];
  const otherParentOptions = spousesOf(theirParent);
  const age = /^\d{4}$/.test(String(birthYear ?? '')) ? new Date().getFullYear() - Number(birthYear) : null;

  const pickRelation = (r: Relation) => {
    form.setValue('relation', r, { shouldValidate: form.formState.isSubmitted });
    // A choice made for the old relation doesn't carry over.
    form.setValue('parentId', '');
    form.setValue('partnerId', '');
    form.setValue('otherParentId', '');
    if (!SPOUSE_RELATIONS.includes(r)) form.setValue('formerPartner', false);
    if (!ADOPTABLE_RELATIONS.includes(r)) form.setValue('adopted', false);
    const implied = r === 'spouse' ? (headGender === 'male' ? 'female' : headGender === 'female' ? 'male' : undefined) : RELATION_GENDER[r];
    if (implied && !genderChosen.current) form.setValue('gender', implied, { shouldValidate: form.formState.isSubmitted });
  };
  const pickGender = (g: Gender) => {
    genderChosen.current = true;
    form.setValue('gender', g, { shouldValidate: form.formState.isSubmitted });
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!member && !consent && !values.deceased) {
      setConsentMissing(true);
      return;
    }
    save.mutate(
      {
        memberId: member?.id ?? null,
        input: {
          ...values,
          // With only one person it could be, say so, so a second son added later doesn't make it unclear.
          parentId: values.parentId || onlyOne(parentOptions),
          partnerId: values.partnerId || onlyOne(partnerOptions),
          ...(!member && !values.deceased && { consent: true as const }),
        },
      },
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

          {parentOptions.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t('member.parentChoice')}</legend>
              <div className="flex flex-wrap gap-2">
                {parentOptions.map((m) => (
                  <Chip key={m.id} selected={parentId === m.id} onClick={() => form.setValue('parentId', parentId === m.id ? '' : m.id)} className="px-3">
                    {m.name}
                  </Chip>
                ))}
              </div>
              <p className="text-sm text-fg-muted">{t('member.parentChoiceHint')}</p>
              {errors.parentId && (
                <p role="alert" className="text-sm text-danger">
                  {fieldError(t, errors.parentId.message)}
                </p>
              )}
            </fieldset>
          )}
          {partnerOptions.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t(gender === 'male' ? 'member.partnerChoice.husband' : 'member.partnerChoice.wife')}</legend>
              <div className="flex flex-wrap gap-2">
                {partnerOptions.map((m) => (
                  <Chip key={m.id} selected={partnerId === m.id} onClick={() => form.setValue('partnerId', partnerId === m.id ? '' : m.id)} className="px-3">
                    {m.name}
                  </Chip>
                ))}
              </div>
              {errors.partnerId && (
                <p role="alert" className="text-sm text-danger">
                  {fieldError(t, errors.partnerId.message)}
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
          {otherParentOptions.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t(theirParent?.gender === 'female' ? 'member.fatherChoice' : 'member.motherChoice')}</legend>
              <div className="flex flex-wrap gap-2">
                {otherParentOptions.map((m) => (
                  <Chip key={m.id} selected={otherParentId === m.id} onClick={() => form.setValue('otherParentId', otherParentId === m.id ? '' : m.id)} className="px-3">
                    {m.name}
                  </Chip>
                ))}
              </div>
              {errors.otherParentId && (
                <p role="alert" className="text-sm text-danger">
                  {fieldError(t, errors.otherParentId.message)}
                </p>
              )}
            </fieldset>
          )}
          {ADOPTABLE_RELATIONS.includes(relation) && <Checkbox label={t('member.adopted')} hint={t('member.adoptedHint')} {...form.register('adopted')} />}
          {SPOUSE_RELATIONS.includes(relation) && <Checkbox label={t('member.formerPartner')} hint={t('member.formerPartnerHint')} {...form.register('formerPartner')} />}

          <Input
            label={t('member.birthYear')}
            labelSuffix={t('common.optional')}
            hint={!deceased && age !== null && age >= 0 && age < 120 ? t('member.ageIs', { age: formatNumber(age, language) }) : t('member.birthYearHint')}
            inputMode="numeric"
            maxLength={4}
            error={fieldError(t, errors.birthYear?.message)}
            {...form.register('birthYear')}
          />
          {!isHead && !phoneLocked && (
            <Checkbox
              label={t('member.deceased')}
              hint={t('member.deceasedHint')}
              error={fieldError(t, errors.deceased?.message)}
              {...form.register('deceased')}
            />
          )}
          {deceased && (
            <Input
              label={t('member.deathYear')}
              labelSuffix={t('common.optional')}
              inputMode="numeric"
              maxLength={4}
              error={fieldError(t, errors.deathYear?.message)}
              {...form.register('deathYear')}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t('member.occupation')} labelSuffix={t('common.optional')} error={fieldError(t, errors.occupation?.message)} {...form.register('occupation')} />
            <Input label={t('member.education')} labelSuffix={t('common.optional')} error={fieldError(t, errors.education?.message)} {...form.register('education')} />
          </div>
          {!deceased && (
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
          )}
          {!member && !deceased && (
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
