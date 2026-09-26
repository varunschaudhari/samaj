import { zodResolver } from '@hookform/resolvers/zod';
import { type FamilyDetail, type FamilyUpdateInput, familyUpdateSchema } from '@samaj/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useUpdateFamily } from './api';
import { gotraOptions } from './gotra-options';

const FIELDS = ['place', 'gotra', 'address'] as const;

const toFormValues = (family: FamilyDetail): FamilyUpdateInput => ({
  place: family.place,
  gotra: family.gotra ?? '',
  address: family.address ?? '',
});

export function FamilyDetailsModal({ family, open, onClose }: { family: FamilyDetail; open: boolean; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const update = useUpdateFamily(family.id);
  const language = useLanguageStore((s) => s.language);
  const form = useForm({ resolver: zodResolver(familyUpdateSchema), defaultValues: toFormValues(family) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(family));
      update.reset();
    }
    // Only when the modal opens; resetting on every render would wipe typing.
  }, [open]);

  const onSubmit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => {
        toast.success(t('family.detailsSaved'));
        onClose();
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('family.detailsTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="family-form" loading={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="family-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {update.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(update.error)} />}
        <Input label={t('family.place')} error={fieldError(t, errors.place?.message)} {...form.register('place')} />
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
          hint={t('family.addressHint')}
          rows={3}
          error={fieldError(t, errors.address?.message)}
          {...form.register('address')}
        />
      </form>
    </Modal>
  );
}
