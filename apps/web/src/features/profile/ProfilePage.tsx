import { formatPhone } from '@samaj/shared';
import { Download, House, KeyRound, LogOut, Pencil, ShieldCheck } from '@/components/ui/icons';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { PageHeader } from '@/components/layout/PageHeader';
import { Avatar, Badge, Button, Card, CardTitle, Icon, Skeleton, buttonVariants, toast } from '@/components/ui';
import { useLogout, useMe } from '@/features/auth/api';
import { branchName, useBranches } from '@/features/branches/api';
import { useFamily } from '@/features/families/api';
import { FamilyStatusBadge } from '@/features/families/FamilyStatusBadge';
import { MemberFormModal } from '@/features/families/MemberFormModal';
import { useLanguageStore, useT } from '@/i18n';
import { promptInstall, useInstallStore } from '@/lib/offline';
import { ChangePasswordModal } from './ChangePasswordModal';

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
  const family = useFamily(me.data?.familyId);
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const canInstall = useInstallStore((s) => s.prompt !== null && !s.installed);

  // RequireAuth guarantees a user here.
  const user = me.data;
  if (!user) return null;

  const branch = branches.data?.find((b) => b.id === user.branchId);
  const self = family.data?.members.find((m) => m.id === user.memberId) ?? null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader title={t('profile.title')} />

      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {family.isPending ? <Skeleton className="size-16 rounded-full" /> : <Avatar name={user.name} src={self?.photoUrl} size="xl" />}
          <div className="flex min-w-0 flex-col gap-1">
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
          <Detail label={t('profile.familyStatus')}>
            <FamilyStatusBadge status={user.familyStatus} />
          </Detail>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={Pencil} disabled={!self} onClick={() => setEditing(true)}>
            {t('profile.editDetails')}
          </Button>
          <Link to={`/families/${user.familyId}`} className={buttonVariants({ variant: 'ghost' })}>
            <Icon icon={House} />
            {t('profile.myFamily')}
          </Link>
        </div>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle>{t('language.label')}</CardTitle>
        <p className="max-w-prose text-sm text-fg-muted">{t('profile.languageHint')}</p>
        <LanguageSwitch className="self-start" />
      </Card>

      {canInstall && (
        <Card padding="lg" className="flex flex-col gap-3 border-primary">
          <CardTitle>{t('install.title')}</CardTitle>
          <p className="max-w-prose text-sm text-fg-muted">{t('install.body')}</p>
          <Button leadingIcon={Download} className="self-start" onClick={() => void promptInstall().then((ok) => ok && toast.success(t('install.done')))}>
            {t('install.button')}
          </Button>
        </Card>
      )}

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle>{t('privacy.settingsTitle')}</CardTitle>
        <p className="max-w-prose text-sm text-fg-muted">{t('privacy.profileBody')}</p>
        <Link to="/profile/privacy" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
          <Icon icon={ShieldCheck} />
          {t('privacy.open')}
        </Link>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <CardTitle>{t('password.title')}</CardTitle>
        <p className="max-w-prose text-sm text-fg-muted">{t('password.cardBody')}</p>
        <Button variant="secondary" leadingIcon={KeyRound} className="self-start" onClick={() => setChangingPassword(true)}>
          {t('password.change')}
        </Button>
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

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
      {self && <MemberFormModal familyId={user.familyId} member={self} members={family.data?.members ?? []} open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}
