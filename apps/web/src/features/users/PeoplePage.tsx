import { type AdminUser, ROLES, type Role, formatPhone } from '@samaj/shared';
import { ChevronRight, Search, SearchX, Users } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Icon, Input, Select, Skeleton } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatTotal, useLanguageStore, useT } from '@/i18n';
import { type UserFilters, useUsers } from './api';
import { ResetCodeModal } from './ResetCodeModal';
import { UserRoleModal } from './UserRoleModal';

const ROLE_TONE: Record<Role, 'neutral' | 'primary' | 'kumkum' | 'zari'> = { member: 'neutral', committee: 'primary', admin: 'kumkum', superadmin: 'zari' };

function UserRow({ user, onOpen }: { user: AdminUser; onOpen: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (
    <Card as="li" padding="none">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors duration-150 hover:bg-surface-muted">
        <Avatar name={user.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-words text-fg">{user.name}</span>
            <Badge tone={ROLE_TONE[user.role]}>{t(`role.${user.role}`)}</Badge>
          </span>
          <span className="text-sm text-fg-muted tabular-nums">{formatPhone(user.phone)}</span>
          <span className="truncate text-sm text-fg-muted">{branchName(user.branch, language)}</span>
        </span>
        <Icon icon={ChevronRight} className="text-fg-muted" />
      </button>
    </Card>
  );
}

function UserRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface p-3" aria-hidden="true">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </li>
  );
}

/** Admin: find anyone with an account and change their role or branch. */
export function PeoplePage() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserFilters['role']>('');
  const q = useDebouncedValue(search.trim());
  const users = useUsers({ q, role });
  const [openId, setOpenId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string } | null>(null);

  const items = users.data?.pages.flatMap((p) => p.items) ?? [];
  const total = users.data?.pages[0]?.total;
  const language = useLanguageStore((s) => s.language);
  const filtered = Boolean(q || role);

  let body;
  if (users.isPending) {
    body = (
      <ul className="flex flex-col gap-2" aria-busy="true" aria-label={t('common.loading')}>
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
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setRole('');
            }}
          >
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
        <ul className="flex flex-col gap-2">
          {items.map((u) => (
            <UserRow key={u.id} user={u} onOpen={() => setOpenId(u.id)} />
          ))}
        </ul>
        {users.hasNextPage && (
          <Button variant="secondary" className="self-center" loading={users.isFetchingNextPage} onClick={() => users.fetchNextPage()}>
            {t('people.loadMore')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted tabular-nums">{total === undefined ? <Skeleton className="h-4 w-24" /> : t('people.count', { count: formatTotal(total, language) })}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          label={t('people.search')}
          hideLabel
          type="search"
          placeholder={t('people.searchPlaceholder')}
          leadingIcon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fieldClassName="sm:flex-1"
        />
        <Select label={t('people.role')} hideLabel value={role} onChange={(e) => setRole(e.target.value as UserFilters['role'])} fieldClassName="sm:w-44">
          <option value="">{t('people.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </Select>
      </div>
      {body}
      <UserRoleModal userId={openId} onClose={() => setOpenId(null)} onResetPassword={(target) => {
        setOpenId(null);
        setResetTarget(target);
      }} />
      <ResetCodeModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
