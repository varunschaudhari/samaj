import { zodResolver } from '@hookform/resolvers/zod';
import { type FamilyMember, GENDERS, type MemberInput, RELATIONS, memberInputSchema } from '@samaj/shared';
import { Phone } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { useErrorMessage, useT } from '@/i18n';
import { useSaveMember } from './api';
import { PhotoField } from './PhotoField';

const FIELDS = ['name', 'relation', 'gender', 'birthYear', 'occupation', 'education', 'phone'] as const;

function toFormValues(member: FamilyMember | null): MemberInput {
  return {
    name: member?.name ?? '',
    relation: member?.relation ?? ('' as MemberInput['relation']),
    gender: member?.gender ?? ('' as MemberInput['gender']),
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
}

export function MemberFormModal({ familyId, member, open, onClose }: MemberFormModalProps) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const save = useSaveMember(familyId);
  const form = useForm({ resolver: zodResolver(memberInputSchema), defaultValues: toFormValues(member) });
  const { errors } = form.formState;

  // Refill the form whenever the modal opens for a different person.
  useEffect(() => {
    if (open) {
      form.reset(toFormValues(member));
      save.reset();
    }
    // Only when the modal opens or switches person; resetting on every render would wipe typing.
  }, [open, member?.id]);

  const isHead = member?.isHead ?? false;
  const phoneLocked = member?.hasAccount ?? false;
  const relations = RELATIONS.filter((r) => (isHead ? r === 'head' : r !== 'head'));
  const showBanner = save.isError && !FIELDS.some((f) => errors[f]?.type === 'server');

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(
      { memberId: member?.id ?? null, input: values },
      {
        onSuccess: () => {
          toast.success(t(member ? 'family.memberSaved' : 'family.memberAdded', { name: values.name }));
          onClose();
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
          <Button type="submit" form="member-form" loading={save.isPending}>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('member.relation')}
              placeholder={t('member.choose')}
              error={fieldError(t, errors.relation?.message)}
              {...form.register('relation')}
            >
              {relations.map((r) => (
                <option key={r} value={r}>
                  {t(`relation.${r}`)}
                </option>
              ))}
            </Select>
            <Select label={t('member.gender')} placeholder={t('member.choose')} error={fieldError(t, errors.gender?.message)} {...form.register('gender')}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`gender.${g}`)}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label={t('member.birthYear')}
            labelSuffix={t('common.optional')}
            hint={t('member.birthYearHint')}
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
        </form>
      </div>
    </Modal>
  );
}
