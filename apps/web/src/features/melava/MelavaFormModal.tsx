import { zodResolver } from '@hookform/resolvers/zod';
import { type MelavaDetail, type MelavaInput, isGlobalRole, melavaInputSchema } from '@samaj/shared';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button, Input, Modal, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { BranchSelect } from '@/features/branches/BranchSelect';
import { useErrorMessage, useT } from '@/i18n';
import { useSaveMelava } from './api';

const FIELDS = ['name', 'date', 'venue', 'branchId', 'fee', 'paymentInstructions', 'registrationOpen'] as const;

function toForm(melava: MelavaDetail | null, branchId: string): MelavaInput {
  return {
    name: melava?.name ?? '',
    date: melava?.date ?? '',
    venue: melava?.venue ?? '',
    branchId: melava?.branch.id ?? branchId,
    fee: melava?.fee ?? 500,
    paymentInstructions: melava?.paymentInstructions ?? '',
    registrationOpen: melava?.registrationOpen ?? true,
  };
}

/** Organise a melava, or change one. Committee members pick their own branch or a town inside it; admins any. */
export function MelavaFormModal({ open, melava, onClose }: { open: boolean; melava: MelavaDetail | null; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const me = useMe();
  const save = useSaveMelava(melava?.id ?? null);
  const scope = me.data && !isGlobalRole(me.data.role) ? me.data.branchId : undefined;
  const form = useForm({ resolver: zodResolver(melavaInputSchema), defaultValues: toForm(melava, scope ?? '') });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(toForm(melava, scope ?? ''));
      save.reset();
    }
    // Once per opening.
  }, [open]);

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        toast.success(t(melava ? 'melava.saved' : 'melava.created'));
        onClose();
        if (!melava) navigate(`/matrimony/melavas/${saved.id}`);
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={melava ? t('melava.editTitle') : t('melava.createTitle')}
      description={t('melava.formBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="melava-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="melava-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {save.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(save.error)} />}
        <Input label={t('melava.name')} placeholder="Nashik Shahar Teli Samaj Vadhu-Var Palak Parichay Melava" error={fieldError(t, errors.name?.message)} {...form.register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('melava.date')} type="date" error={fieldError(t, errors.date?.message)} {...form.register('date')} />
          <Input label={t('melava.fee')} inputMode="numeric" error={fieldError(t, errors.fee?.message)} {...form.register('fee')} />
        </div>
        <Input label={t('melava.venue')} labelSuffix={t('common.optional')} error={fieldError(t, errors.venue?.message)} {...form.register('venue')} />
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <BranchSelect
              label={t('melava.branch')}
              hideLabel={false}
              allLabel={t('auth.field.branchPlaceholder')}
              value={field.value}
              onChange={field.onChange}
              within={scope}
              fieldClassName="w-full"
            />
          )}
        />
        {errors.branchId?.message && <p className="-mt-2 text-sm text-danger">{fieldError(t, errors.branchId.message)}</p>}
        <Textarea
          label={t('melava.paymentInstructions')}
          labelSuffix={t('common.optional')}
          hint={t('melava.paymentInstructionsHint')}
          rows={3}
          error={fieldError(t, errors.paymentInstructions?.message)}
          {...form.register('paymentInstructions')}
        />
        <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-fg">
          <input type="checkbox" className="size-5 shrink-0 accent-primary" {...form.register('registrationOpen')} />
          {t('melava.registrationOpen')}
        </label>
      </form>
    </Modal>
  );
}
