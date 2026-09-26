import { zodResolver } from '@hookform/resolvers/zod';
import { type ChangePasswordInput, changePasswordSchema } from '@samaj/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Modal, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { useChangePassword } from '@/features/users/api';
import { useErrorMessage, useT } from '@/i18n';

const FIELDS = ['currentPassword', 'newPassword'] as const;
const EMPTY: ChangePasswordInput = { currentPassword: '', newPassword: '' };

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const change = useChangePassword();
  const form = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: EMPTY });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      change.reset();
    }
    // Only when the modal opens.
  }, [open]);

  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        toast.success(t('password.changed'));
        onClose();
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('password.title')}
      description={t('password.body')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="password-form" loading={change.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="password-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {change.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(change.error)} />}
        <PasswordInput label={t('password.current')} autoComplete="current-password" error={fieldError(t, errors.currentPassword?.message)} {...form.register('currentPassword')} />
        <PasswordInput
          label={t('password.new')}
          hint={t('auth.field.passwordHint')}
          autoComplete="new-password"
          error={fieldError(t, errors.newPassword?.message)}
          {...form.register('newPassword')}
        />
      </form>
    </Modal>
  );
}
