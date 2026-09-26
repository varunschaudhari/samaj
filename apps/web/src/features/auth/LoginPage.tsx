import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@samaj/shared';
import { Phone } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Input } from '@/components/ui';
import { useErrorMessage, useT } from '@/i18n';
import { useLogin } from './api';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import { applyServerIssues, fieldError } from './form-errors';
import { PasswordInput } from './PasswordInput';

/** Only follow ?next= to a path inside the app. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/directory';
}

export function LoginPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { phone: '', password: '' } satisfies LoginInput });
  const { errors } = form.formState;
  const showBanner = login.isError && !(['phone', 'password'] as const).some((f) => errors[f]?.type === 'server');

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }),
      onError: (err) => applyServerIssues(err, ['phone', 'password'], form.setError),
    });
  });

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showBanner && <FormAlert message={errorMessage(login.error)} />}
        <Input
          label={t('auth.field.phone')}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leadingIcon={Phone}
          error={fieldError(t, errors.phone?.message)}
          {...form.register('phone')}
        />
        <PasswordInput
          label={t('auth.field.password')}
          autoComplete="current-password"
          error={fieldError(t, errors.password?.message)}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" fullWidth loading={login.isPending}>
          {t('auth.login.submit')}
        </Button>
        <Link to="/reset-password" className="inline-flex min-h-touch items-center self-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {t('reset.forgot')}
        </Link>
      </form>
    </AuthLayout>
  );
}
