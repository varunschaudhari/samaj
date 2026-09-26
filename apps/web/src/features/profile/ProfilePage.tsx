import { formatPhone } from '@samaj/shared';
import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardTitle, Skeleton, toast } from '@/components/ui';
import { useLogout, useMe } from '@/features/auth/api';
import { branchName, useBranches } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-sm text-fg-muted sm:w-40">{label}</dt>
      <dd className="font-semibold text-fg">{children}</dd>
    </div>
  );
}

export function ProfilePage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const branches = useBranches();
  const logout = useLogout();
  // RequireAuth guarantees a user here.
  const user = me.data;
  if (!user) return null;

  const branch = branches.data?.find((b) => b.id === user.branchId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title={t('profile.title')} />

      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size="xl" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-xl font-semibold break-words text-fg sm:text-2xl">{user.name}</p>
            <Badge tone={user.role === 'member' ? 'neutral' : 'primary'} className="self-start">
              {t(`role.${user.role}`)}
            </Badge>
          </div>
        </div>
        <dl className="divide-y divide-line border-t border-line">
          <Detail label={t('profile.phone')}>
            <span className="tabular-nums">{formatPhone(user.phone)}</span>
          </Detail>
          <Detail label={t('profile.branch')}>
            {branches.isPending ? <Skeleton className="h-5 w-32" /> : branch ? branchName(branch, language) : '–'}
          </Detail>
        </dl>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle>{t('language.label')}</CardTitle>
        <p className="max-w-prose text-sm text-fg-muted">{t('profile.languageHint')}</p>
        <LanguageSwitch className="self-start" />
      </Card>

      <Button
        variant="secondary"
        leadingIcon={LogOut}
        className="self-start"
        loading={logout.isPending}
        onClick={() => logout.mutate(undefined, { onSettled: () => toast.info(t('auth.loggedOut')) })}
      >
        {t('auth.logout')}
      </Button>
    </div>
  );
}
