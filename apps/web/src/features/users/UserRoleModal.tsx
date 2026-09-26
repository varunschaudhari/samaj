import { zodResolver } from '@hookform/resolvers/zod';
import { PROTECTED_ROLES, type RoleUpdateInput, assignableRoles, formatPhone, roleUpdateSchema } from '@samaj/shared';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ErrorState, Modal, Select, Skeleton, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { useMe } from '@/features/auth/api';
import { branchName, groupBranches, useBranches } from '@/features/branches/api';
import { formatDate, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useUpdateRole, useUser } from './api';

interface UserRoleModalProps {
  userId: string | null;
  onClose: () => void;
  onResetPassword: (target: { userId: string; name: string }) => void;
}

const FIELDS = ['role', 'branchId'] as const;

/** Change someone's role and branch, see who changed it before, or make a reset code. */
export function UserRoleModal({ userId, onClose, onResetPassword }: UserRoleModalProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const user = useUser(userId);
  const me = useMe();
  // Admins give out member and committee; only a super admin gives out admin roles.
  const roles = me.data ? assignableRoles(me.data.role) : [];
  const branches = useBranches();
  const update = useUpdateRole(userId ?? '');
  const form = useForm({ resolver: zodResolver(roleUpdateSchema), defaultValues: { role: 'member', branchId: '' } as RoleUpdateInput });
  const { errors } = form.formState;
  const role = form.watch('role');

  useEffect(() => {
    if (user.data) form.reset({ role: user.data.role, branchId: user.data.branch.id });
    update.reset();
    // Refill when a different person's details arrive.
  }, [user.data?.id]);

  const canChange = user.data?.permissions.canChangeRole ?? false;

  const onSubmit = form.handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: ({ user: saved }) => {
        toast.success(t('people.roleSaved', { name: saved.name, role: t(`role.${saved.role}`) }));
        onClose();
      },
      onError: (err) => applyServerIssues(err, FIELDS, form.setError),
    }),
  );

  const hint = role === 'committee' ? t('people.branchHintCommittee') : PROTECTED_ROLES.includes(role) ? t('people.branchHintAdmin') : t('people.branchHintMember');

  return (
    <Modal
      open={userId !== null}
      onClose={onClose}
      title={user.data?.name ?? t('common.loading')}
      description={user.data ? formatPhone(user.data.phone) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {canChange && (
            <Button type="submit" form="role-form" loading={update.isPending}>
              {t('common.save')}
            </Button>
          )}
        </>
      }
    >
      {user.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-touch w-full rounded-sm" />
          <Skeleton className="h-touch w-full rounded-sm" />
        </div>
      )}
      {user.isError && <ErrorState title={t('people.detailFailed')} error={user.error} onRetry={() => user.refetch()} />}
      {user.data && (
        <div className="flex flex-col gap-5">
          {canChange ? (
            <form id="role-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              {update.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(update.error)} />}
              <Select label={t('people.role')} error={fieldError(t, errors.role?.message)} {...form.register('role')}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
              <Select label={t('people.branch')} hint={hint} error={fieldError(t, errors.branchId?.message)} disabled={branches.isPending} {...form.register('branchId')}>
                {groupBranches(branches.data ?? [], language).map(({ district, children }) => (
                  <optgroup key={district.id} label={branchName(district, language)}>
                    <option value={district.id}>
                      {branchName(district, language)} ({t('branchKind.district')})
                    </option>
                    {children.map((b) => (
                      <option key={b.id} value={b.id}>
                        {branchName(b, language)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </form>
          ) : (
            <p className="rounded-sm bg-surface-muted p-3 text-sm text-fg">
              {user.data.id === me.data?.id ? t('people.cantChangeOwn') : t('people.cantChangeAdmin')}
            </p>
          )}

          {user.data.permissions.canResetPassword && (
            <Button variant="secondary" leadingIcon={KeyRound} className="self-start" onClick={() => onResetPassword({ userId: user.data.id, name: user.data.name })}>
              {t('reset.create')}
            </Button>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg">{t('people.history')}</h3>
            {user.data.roleHistory.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('people.historyEmpty')}</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {user.data.roleHistory.map((c, i) => (
                  <li key={`${c.at}-${i}`} className="flex flex-col gap-0.5 py-2 text-sm">
                    <span className="text-fg">
                      {t('people.historyEntry', {
                        from: t(`role.${c.fromRole}`),
                        to: t(`role.${c.toRole}`),
                        branch: c.toBranch ?? '–',
                      })}
                    </span>
                    <span className="text-xs text-fg-muted tabular-nums">
                      {t('family.history.by', { name: c.byName })} · {formatDate(c.at, language)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
