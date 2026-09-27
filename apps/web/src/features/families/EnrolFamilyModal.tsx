import { zodResolver } from '@hookform/resolvers/zod';
import { type Branch, type EnrolFamilyInput, GENDERS, type Language, enrolFamilySchema, isGlobalRole } from '@samaj/shared';
import { Phone } from '@/components/ui/icons';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { branchName, groupBranches, useBranches } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useEnrolFamily } from './api';
import { gotraOptions } from './gotra-options';

const FIELDS = [
  'branchId',
  'place',
  'gotra',
  'address',
  'head.name',
  'head.gender',
  'head.birthYear',
  'head.occupation',
  'head.education',
  'head.phone',
] as const;

const emptyForm = (branchId: string): EnrolFamilyInput => ({
  branchId,
  place: '',
  gotra: '',
  address: '',
  head: { name: '', gender: '' as EnrolFamilyInput['head']['gender'], birthYear: '', occupation: '', education: '', phone: '' },
});

/** Admins pick any branch; committee members their own and the towns inside it. The API enforces the same. */
function BranchOptions({ branches, scope, language }: { branches: Branch[]; scope: string | null; language: Language }) {
  const t = useT();
  if (scope === null) {
    return groupBranches(branches, language).map(({ district, children }) => (
      <optgroup key={district.id} label={branchName(district, language)}>
        {children.map((b) => (
          <option key={b.id} value={b.id}>
            {branchName(b, language)}
          </option>
        ))}
        <option value={district.id}>
          {branchName(district, language)} ({t('branchKind.district')})
        </option>
      </optgroup>
    ));
  }
  const own = branches.find((b) => b.id === scope);
  const inside = branches.filter((b) => b.parentId === scope).sort((a, b) => branchName(a, language).localeCompare(branchName(b, language), language));
  return [...(own ? [own] : []), ...inside].map((b) => (
    <option key={b.id} value={b.id}>
      {branchName(b, language)}
    </option>
  ));
}

/**
 * A committee member or admin registers a family that can't sign up itself:
 * elders without a smartphone, or households met at an enrolment camp. The
 * family starts verified; people in it can be given their own sign-in later.
 */
export function EnrolFamilyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const me = useMe();
  const branches = useBranches();
  const enrol = useEnrolFamily();
  const scope = me.data && !isGlobalRole(me.data.role) ? me.data.branchId : null;
  const form = useForm({ resolver: zodResolver(enrolFamilySchema), defaultValues: emptyForm(scope ?? '') });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(emptyForm(scope ?? ''));
      enrol.reset();
    }
    // Only when the modal opens; resetting on every render would wipe typing.
  }, [open]);

  // The committee's own branch is preselected, but the dropdown has no options until branches load.
  // Setting the value again once they have makes the dropdown show it.
  useEffect(() => {
    if (open && branches.isSuccess && scope) form.setValue('branchId', form.getValues('branchId') || scope);
  }, [open, branches.isSuccess]);

  const onSubmit = form.handleSubmit((values) =>
    enrol.mutate(values, {
      onSuccess: (family) => {
        toast.success(t('enrol.done', { name: family.headName }));
        onClose();
        navigate(`/families/${family.id}`);
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  const showBanner = enrol.isError && !FIELDS.some((f) => form.getFieldState(f).error?.type === 'server');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('enrol.title')}
      description={t('enrol.body')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="enrol-form" loading={enrol.isPending}>
            {t('enrol.submit')}
          </Button>
        </>
      }
    >
      <form id="enrol-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showBanner && <FormAlert message={errorMessage(enrol.error)} />}
        <h3 className="font-semibold text-fg">{t('enrol.headSection')}</h3>
        <Input label={t('member.name')} autoComplete="off" error={fieldError(t, errors.head?.name?.message)} {...form.register('head.name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('member.gender')} placeholder={t('member.choose')} error={fieldError(t, errors.head?.gender?.message)} {...form.register('head.gender')}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`gender.${g}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t('member.birthYear')}
            labelSuffix={t('common.optional')}
            inputMode="numeric"
            maxLength={4}
            error={fieldError(t, errors.head?.birthYear?.message)}
            {...form.register('head.birthYear')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('member.occupation')} labelSuffix={t('common.optional')} error={fieldError(t, errors.head?.occupation?.message)} {...form.register('head.occupation')} />
          <Input label={t('member.education')} labelSuffix={t('common.optional')} error={fieldError(t, errors.head?.education?.message)} {...form.register('head.education')} />
        </div>
        <Input
          label={t('member.phone')}
          labelSuffix={t('common.optional')}
          hint={t('member.phoneHint')}
          type="tel"
          inputMode="numeric"
          leadingIcon={Phone}
          error={fieldError(t, errors.head?.phone?.message)}
          {...form.register('head.phone')}
        />

        <h3 className="mt-2 font-semibold text-fg">{t('enrol.familySection')}</h3>
        <Select
          label={t('auth.field.branch')}
          placeholder={t('auth.field.branchPlaceholder')}
          error={fieldError(t, errors.branchId?.message) ?? (branches.isError ? t('auth.branchesFailed') : undefined)}
          disabled={!branches.data}
          {...form.register('branchId')}
        >
          {branches.data && <BranchOptions branches={branches.data} scope={scope} language={language} />}
        </Select>
        <Input label={t('family.place')} labelSuffix={t('common.optional')} hint={t('enrol.placeHint')} error={fieldError(t, errors.place?.message)} {...form.register('place')} />
        <Select label={t('family.gotra')} hint={t('family.gotraHint')} error={fieldError(t, errors.gotra?.message)} {...form.register('gotra')}>
          <option value="">{t('family.gotraNone')}</option>
          {gotraOptions(language).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Textarea
          label={t('family.address')}
          labelSuffix={t('common.optional')}
          rows={2}
          error={fieldError(t, errors.address?.message)}
          {...form.register('address')}
        />
      </form>
    </Modal>
  );
}
