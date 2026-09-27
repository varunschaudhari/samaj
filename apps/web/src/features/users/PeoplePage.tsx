import { type AdminUser, ROLES, type Role, formatPhone } from '@samaj/shared';
import { ChevronRight, SearchX, Users } from '@/components/ui/icons';
import { useState } from 'react';
import { type ActiveFilter, Avatar, Badge, Button, EmptyState, ErrorState, Icon, ListToolbar, LoadMore, Select, Skeleton } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { FamilyStatusBadge } from '@/features/families/FamilyStatusBadge';
import { cn } from '@/lib/cn';
import { BranchSelect, useBranchLabel } from '@/features/branches/BranchSelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatTotal, useLanguageStore, useT } from '@/i18n';
import { type UserFilters, useUsers } from './api';
import { ResetCodeModal } from './ResetCodeModal';
import { UserRoleModal } from './UserRoleModal';

const LIST = 'divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card';

const ROLE_TONE: Record<Role, 'neutral' | 'primary' | 'kumkum' | 'zari'> = { member: 'neutral', committee: 'primary', admin: 'kumkum', superadmin: 'zari' };

/** Columns from lg up; phones show each account as a compact row. */
const COLUMNS = 'lg:grid lg:grid-cols-[2.5rem_minmax(14rem,2fr)_minmax(9rem,1fr)_minmax(10rem,1.4fr)_minmax(7rem,0.8fr)_minmax(13rem,1.2fr)_1.5rem] lg:gap-4';

function UserListHeader() {
  const t = useT();
  return (
    <li aria-hidden="true" className={cn('hidden items-center bg-surface-muted px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase', COLUMNS)}>
      <span />
      <span>{t('directory.col.name')}</span>
      <span>{t('directory.col.phone')}</span>
      <span>{t('directory.filterBranch')}</span>
      <span>{t('people.role')}</span>
      <span>{t('people.col.family')}</span>
      <span />
    </li>
  );
}

function UserRow({ user, onOpen }: { user: AdminUser; onOpen: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-muted lg:py-2.5', COLUMNS)}
      >
        <Avatar name={user.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words text-fg">{user.name}</span>
            <Badge tone={ROLE_TONE[user.role]} className="lg:hidden">
              {t(`role.${user.role}`)}
            </Badge>
          </span>
          <span className="text-sm text-fg-muted tabular-nums lg:hidden">{formatPhone(user.phone)}</span>
          <span className="truncate text-sm text-fg-muted lg:hidden">{branchName(user.branch, language)}</span>
        </span>
        <span className="hidden text-sm text-fg tabular-nums lg:block">{formatPhone(user.phone)}</span>
        <span className="hidden truncate text-sm text-fg lg:block">{branchName(user.branch, language)}</span>
        <span className="hidden lg:block">
          <Badge tone={ROLE_TONE[user.role]}>{t(`role.${user.role}`)}</Badge>
        </span>
        <span className="hidden lg:block">
          <FamilyStatusBadge status={user.familyStatus} />
        </span>
        <Icon icon={ChevronRight} className="text-fg-muted" />
      </button>
    </li>
  );
}

function UserRowSkeleton() {
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 lg:py-2.5', COLUMNS)} aria-hidden="true">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-1/3 lg:hidden" />
      </div>
      <Skeleton className="hidden h-4 w-3/4 lg:block" />
      <Skeleton className="hidden h-4 w-2/3 lg:block" />
      <Skeleton className="hidden h-5 w-20 lg:block" />
      <Skeleton className="hidden h-5 w-20 lg:block" />
      <span />
    </li>
  );
}

/** Admin: find anyone with an account and change their role or branch. */
export function PeoplePage() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserFilters['role']>('');
  const [branchId, setBranchId] = useState('');
  const q = useDebouncedValue(search.trim());
  const users = useUsers({ q, role, branchId });
  const branchLabel = useBranchLabel(branchId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);

  const items = users.data?.pages.flatMap((p) => p.items) ?? [];
  const total = users.data?.pages[0]?.total;
  const language = useLanguageStore((s) => s.language);
  const filtered = Boolean(q || role || branchId);
  const clearAll = () => {
    setSearch('');
    setRole('');
    setBranchId('');
  };
  const active: ActiveFilter[] = [
    ...(role ? [{ key: 'role', label: `${t('people.role')}: ${t(`role.${role}`)}`, onRemove: () => setRole('') }] : []),
    ...(branchLabel ? [{ key: 'branch', label: `${t('directory.filterBranch')}: ${branchLabel}`, onRemove: () => setBranchId('') }] : []),
  ];

  let body;
  if (users.isPending) {
    body = (
      <ul className={LIST} aria-busy="true" aria-label={t('common.loading')}>
        <UserListHeader />
        {[0, 1, 2, 3].map((i) => (
          <UserRowSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (users.isError && items.length === 0) {
    body = <ErrorState title={t('people.error.title')} error={users.error} onRetry={() => users.refetch()} retrying={users.isFetching} />;
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchX}
        title={t('people.noResults.title')}
        body={t('people.noResults.body')}
        action={
          <Button variant="secondary" onClick={clearAll}>
            {t('directory.clearFilters')}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Users} title={t('people.empty.title')} body={t('people.empty.body')} />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ul className={LIST} aria-busy={users.isPlaceholderData || undefined}>
          <UserListHeader />
          {items.map((u) => (
            <UserRow key={u.id} user={u} onOpen={() => setOpenId(u.id)} />
          ))}
        </ul>
        <LoadMore {...users} label={t('people.loadMore')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{ value: search, onChange: setSearch, label: t('people.search'), placeholder: t('people.searchPlaceholder') }}
        active={active}
        onClearAll={clearAll}
        summary={total === undefined ? <Skeleton className="h-4 w-24" /> : t('people.count', { count: formatTotal(total, language) })}
        filters={
          <>
            <Select label={t('people.role')} hideLabel value={role} onChange={(e) => setRole(e.target.value as UserFilters['role'])} fieldClassName="md:w-40">
              <option value="">{t('people.allRoles')}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
            <BranchSelect label={t('directory.filterBranch')} allLabel={t('directory.allBranches')} value={branchId} onChange={setBranchId} />
          </>
        }
      />
      {body}
      <UserRoleModal userId={openId} onClose={() => setOpenId(null)} onResetPassword={(target) => {
        setOpenId(null);
        setResetTarget(target);
      }} />
      <ResetCodeModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
