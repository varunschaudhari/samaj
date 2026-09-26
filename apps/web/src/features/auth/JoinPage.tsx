import { zodResolver } from '@hookform/resolvers/zod';
import { type JoinInput, joinSchema } from '@samaj/shared';
import { Phone, UsersRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Icon, Input } from '@/components/ui';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useJoin } from './api';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import { applyServerIssues, fieldError } from './form-errors';
import { PasswordInput } from './PasswordInput';

const FIELDS = ['phone', 'code', 'password'] as const;

/**
 * For someone already listed in a family: their family head or branch
 * committee gives them an invite code, and they sign in to that family with
 * their own number instead of registering a second one.
 */
export function JoinPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const join = useJoin();
  const form = useForm({ resolver: zodResolver(joinSchema), defaultValues: { phone: '', code: '', password: '' } satisfies JoinInput });
  const { errors } = form.formState;
  const showBanner = join.isError && !FIELDS.some((f) => errors[f]?.type === 'server');

  const onSubmit = form.handleSubmit((values) =>
    join.mutate(
      { ...values, language: useLanguageStore.getState().language },
      {
        onSuccess: () => navigate('/family', { replace: true }),
        onError: (err) => applyServerIssues(err, FIELDS, form.setError),
      },
    ),
  );

  return (
    <AuthLayout
      title={t('join.title')}
      subtitle={t('join.subtitle')}
      footer={
        <>
          {t('join.notListed')}{' '}
          <Link to="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <Card variant="muted" className="flex items-start gap-3">
        <Icon icon={UsersRound} className="mt-0.5 text-primary" />
        <p className="text-sm text-fg">{t('join.howTo')}</p>
      </Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showBanner && <FormAlert message={errorMessage(join.error)} />}
        <Input
          label={t('auth.field.phone')}
          hint={t('join.phoneHint')}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leadingIcon={Phone}
          error={fieldError(t, errors.phone?.message)}
          {...form.register('phone')}
        />
        <Input
          label={t('join.code')}
          hint={t('reset.codeHint')}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
          error={fieldError(t, errors.code?.message)}
          {...form.register('code')}
        />
        <PasswordInput
          label={t('auth.field.password')}
          hint={t('auth.field.passwordHint')}
          autoComplete="new-password"
          error={fieldError(t, errors.password?.message)}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" fullWidth loading={join.isPending}>
          {t('join.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
