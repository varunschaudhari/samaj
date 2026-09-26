import { zodResolver } from '@hookform/resolvers/zod';
import { GENDERS, type SignupInput, signupSchema } from '@samaj/shared';
import { Phone, RotateCw } from 'lucide-react';
import { type UseFormRegisterReturn, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { branchName, groupBranches, useBranches } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useSignup } from './api';
import { AuthLayout } from './AuthLayout';
import { FormAlert } from './FormAlert';
import { applyServerIssues, fieldError } from './form-errors';
import { PasswordInput } from './PasswordInput';

const FIELDS = ['name', 'gender', 'phone', 'password', 'branchId'] as const;

function BranchField({ error, register }: { error: string | undefined; register: UseFormRegisterReturn<'branchId'> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const branches = useBranches();

  if (branches.isPending) {
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-touch w-full rounded-sm" />
      </div>
    );
  }
  if (branches.isError) {
    return (
      <div className="flex flex-col gap-2 rounded-sm border border-line p-3">
        <p className="text-sm text-fg">{t('auth.branchesFailed')}</p>
        <Button variant="secondary" size="sm" leadingIcon={RotateCw} onClick={() => branches.refetch()} loading={branches.isFetching} className="self-start">
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <Select label={t('auth.field.branch')} hint={t('auth.field.branchHint')} placeholder={t('auth.field.branchPlaceholder')} error={error} defaultValue="" {...register}>
      {groupBranches(branches.data, language).map(({ district, children }) => (
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
      ))}
    </Select>
  );
}

export function SignupPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const signup = useSignup();
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', gender: '' as SignupInput['gender'], phone: '', password: '', branchId: '' } satisfies SignupInput,
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    signup.mutate(
      { ...values, language: useLanguageStore.getState().language },
      {
        onSuccess: () => navigate('/community', { replace: true }),
        onError: (err) => applyServerIssues(err, FIELDS, form.setError),
      },
    );
  });

  const showBanner = signup.isError && !FIELDS.some((f) => errors[f]?.type === 'server');

  return (
    <AuthLayout
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <>
          {t('auth.signup.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t('auth.signup.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {showBanner && <FormAlert message={errorMessage(signup.error)} />}
        <Input label={t('auth.field.name')} autoComplete="name" error={fieldError(t, errors.name?.message)} {...form.register('name')} />
        <Select label={t('auth.field.gender')} placeholder={t('member.choose')} error={fieldError(t, errors.gender?.message)} {...form.register('gender')}>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {t(`gender.${g}`)}
            </option>
          ))}
        </Select>
        <Input
          label={t('auth.field.phone')}
          hint={t('auth.field.phoneHint')}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leadingIcon={Phone}
          error={fieldError(t, errors.phone?.message)}
          {...form.register('phone')}
        />
        <PasswordInput
          label={t('auth.field.password')}
          hint={t('auth.field.passwordHint')}
          autoComplete="new-password"
          error={fieldError(t, errors.password?.message)}
          {...form.register('password')}
        />
        <BranchField error={fieldError(t, errors.branchId?.message)} register={form.register('branchId')} />
        <Button type="submit" size="lg" fullWidth loading={signup.isPending}>
          {t('auth.signup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
