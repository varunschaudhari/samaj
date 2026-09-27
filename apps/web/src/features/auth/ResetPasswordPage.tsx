import { zodResolver } from '@hookform/resolvers/zod';
import { type ResetPasswordInput, resetPasswordSchema } from '@samaj/shared';
import { KeyRound, Phone } from '@/components/ui/icons';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Icon, Input, toast } from '@/components/ui';
import { useResetPassword } from '@/features/users/api';
import { useErrorMessage, useT } from '@/i18n';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import { applyServerIssues, fieldError } from './form-errors';
import { PasswordInput } from './PasswordInput';

const FIELDS = ['phone', 'code', 'password'] as const;

/** Forgot password: there is no SMS, so the branch committee gives the member a one-time code. */
export function ResetPasswordPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const reset = useResetPassword();
  const form = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { phone: '', code: '', password: '' } satisfies ResetPasswordInput });
  const { errors } = form.formState;
  const showBanner = reset.isError && !FIELDS.some((f) => errors[f]?.type === 'server');

  const onSubmit = form.handleSubmit((values) =>
    reset.mutate(values, {
      onSuccess: () => {
        toast.success(t('reset.done'));
        navigate('/login', { replace: true });
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  return (
    <AuthLayout
      title={t('reset.title')}
      subtitle={t('reset.subtitle')}
      footer={
        <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
          {t('reset.backToLogin')}
        </Link>
      }
    >
      <Card variant="muted" className="flex items-start gap-3">
        <Icon icon={KeyRound} className="mt-0.5 text-primary" />
        <p className="text-sm text-fg">{t('reset.howTo')}</p>
      </Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showBanner && <FormAlert message={errorMessage(reset.error)} />}
        <Input
          label={t('auth.field.phone')}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leadingIcon={Phone}
          error={fieldError(t, errors.phone?.message)}
          {...form.register('phone')}
        />
        <Input
          label={t('reset.code')}
          hint={t('reset.codeHint')}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
          error={fieldError(t, errors.code?.message)}
          {...form.register('code')}
        />
        <PasswordInput
          label={t('reset.newPassword')}
          hint={t('auth.field.passwordHint')}
          autoComplete="new-password"
          error={fieldError(t, errors.password?.message)}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" fullWidth loading={reset.isPending}>
          {t('reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
