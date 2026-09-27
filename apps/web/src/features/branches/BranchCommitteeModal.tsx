import { type AdminUser, OFFICE_POSTS, type OfficePost, type BranchSummary, PROTECTED_ROLES, formatPhone } from '@samaj/shared';
import { Search, UserMinus, UserPlus } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Avatar, Button, Icon, IconButton, Input, Modal, Select, Skeleton, toast } from '@/components/ui';
import { useUsers } from '@/features/users/api';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useAssignCommittee, useRemoveCommittee } from './admin-api';
import { branchName } from './api';

/**
 * One branch's committee: who is on it, and adding or removing people.
 * Adding changes the person's role to committee for this branch; removing
 * makes them a member again in their own family's branch.
 */
export function BranchCommitteeModal({ branch, onClose }: { branch: BranchSummary | null; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const assign = useAssignCommittee();
  const remove = useRemoveCommittee();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [listAs, setListAs] = useState<OfficePost | ''>('member');
  const [confirming, setConfirming] = useState<string | null>(null);
  const results = useUsers({ q, role: '', branchId: '' });

  useEffect(() => {
    setSearch('');
    setPicked(null);
    setListAs('member');
    setConfirming(null);
  }, [branch?.id]);

  if (!branch) return <Modal open={false} onClose={onClose} title="" />;
  const name = branchName(branch, language);
  const onCommittee = new Set(branch.committee.map((c) => c.userId));
  // Admins already work everywhere, and people already on this committee are listed above.
  const candidates = (results.data?.pages.flatMap((p) => p.items) ?? []).filter((u) => !onCommittee.has(u.id) && !PROTECTED_ROLES.includes(u.role));

  const add = () =>
    picked &&
    assign.mutate(
      { branchId: branch.id, input: { userId: picked.id, listAs: listAs || null } },
      {
        onSuccess: () => {
          toast.success(t('branchCommittee.added', { name: picked.name, branch: name }));
          setPicked(null);
          setSearch('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <Modal open onClose={onClose} title={t('branchCommittee.title', { branch: name })} description={t('branchCommittee.body')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('branchCommittee.current')}</h3>
          {branch.committee.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('branchCommittee.none')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {branch.committee.map((c) => (
                <li key={c.userId} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={c.name} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold break-words text-fg">{c.name}</span>
                    <span className="text-xs text-fg-muted tabular-nums">{formatPhone(c.phone)}</span>
                  </div>
                  {confirming === c.userId ? (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={remove.isPending}
                        onClick={() =>
                          remove.mutate(
                            { branchId: branch.id, userId: c.userId },
                            {
                              onSuccess: () => {
                                toast.success(t('branchCommittee.removed', { name: c.name }));
                                setConfirming(null);
                              },
                              onError: (err) => toast.error(errorMessage(err)),
                            },
                          )
                        }
                      >
                        {t('family.removeConfirm')}
                      </Button>
                    </div>
                  ) : (
                    <IconButton icon={UserMinus} label={t('branchCommittee.remove', { name: c.name })} onClick={() => setConfirming(c.userId)} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {confirming && <p className="text-xs text-fg-muted">{t('branchCommittee.removeNote')}</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg">{t('branchCommittee.addHeading')}</h3>
          {picked ? (
            <div className="flex flex-col gap-3 rounded-md border border-primary p-3">
              <div className="flex items-center gap-3">
                <Avatar name={picked.name} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-fg">{picked.name}</span>
                  <span className="text-xs text-fg-muted tabular-nums">
                    {formatPhone(picked.phone)} · {t(`role.${picked.role}`)} · {branchName(picked.branch, language)}
                  </span>
                </div>
              </div>
              {picked.role === 'committee' && <p className="text-sm text-warning">{t('branchCommittee.moves', { from: branchName(picked.branch, language) })}</p>}
              <Select label={t('branchCommittee.listAs')} hint={t('branchCommittee.listAsHint')} value={listAs} onChange={(e) => setListAs(e.target.value as OfficePost | '')}>
                <option value="">{t('branchCommittee.dontList')}</option>
                {OFFICE_POSTS.map((p) => (
                  <option key={p} value={p}>
                    {t(`committee.post.${p}`)}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button leadingIcon={UserPlus} loading={assign.isPending} onClick={add}>
                  {t('branchCommittee.add', { branch: name })}
                </Button>
                <Button variant="ghost" onClick={() => setPicked(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Input
                label={t('people.search')}
                hideLabel
                type="search"
                placeholder={t('people.searchPlaceholder')}
                leadingIcon={Search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {q.length < 2 ? (
                <p className="text-sm text-fg-muted">{t('branchCommittee.searchHint')}</p>
              ) : results.isPending ? (
                <div className="flex flex-col gap-2" aria-busy="true">
                  <Skeleton className="h-12 w-full rounded-sm" />
                  <Skeleton className="h-12 w-full rounded-sm" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('branchCommittee.noMatch')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {candidates.slice(0, 8).map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(u)}
                        className={cn('flex min-h-touch w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-muted')}
                      >
                        <Avatar name={u.name} size="sm" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold text-fg">{u.name}</span>
                          <span className="truncate text-xs text-fg-muted tabular-nums">
                            {formatPhone(u.phone)} · {branchName(u.branch, language)}
                          </span>
                        </span>
                        <Icon icon={UserPlus} className="text-primary" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
