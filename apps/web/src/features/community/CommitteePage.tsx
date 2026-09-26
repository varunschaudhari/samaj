import { zodResolver } from '@hookform/resolvers/zod';
import { type CommitteeGroup, OFFICE_POSTS, type OfficeBearer, type OfficeBearerInput, formatPhone, officeBearerInputSchema } from '@samaj/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Phone, Plus, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, IconButton, Input, Modal, Select, Skeleton, Tooltip, buttonVariants, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { branchName } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const committeeKey = ['committee'] as const;

function useCommittee() {
  return useQuery({
    queryKey: committeeKey,
    queryFn: async ({ signal }) => (await api.get<{ groups: CommitteeGroup[] }>('/committee', undefined, signal)).groups,
  });
}

function useCommitteeMutation<TVars>(run: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: () => void queryClient.invalidateQueries({ queryKey: committeeKey }) });
}

type Target = { branch: CommitteeGroup['branch']; bearer: OfficeBearer | null };
const FIELDS = ['post', 'name', 'phone'] as const;

function BearerModal({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const save = useCommitteeMutation(({ id, input }: { id: string | null; input: OfficeBearerInput }) =>
    id ? api.put(`/committee/${id}`, input) : api.post('/committee', input),
  );
  const defaults = (): OfficeBearerInput => ({
    branchId: target?.branch.id ?? '',
    post: target?.bearer?.post ?? 'president',
    name: target?.bearer?.name ?? '',
    phone: target?.bearer?.phone ?? '',
  });
  const form = useForm({ resolver: zodResolver(officeBearerInputSchema), defaultValues: defaults() });
  const { errors } = form.formState;

  useEffect(() => {
    if (target) {
      form.reset(defaults());
      save.reset();
    }
    // Once per opening.
  }, [target]);

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { id: target?.bearer?.id ?? null, input: values },
      {
        onSuccess: () => {
          toast.success(t('committee.saved'));
          onClose();
        },
        onError: (err) => applyServerIssues(err, FIELDS, form.setError),
      },
    ),
  );

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target?.bearer ? t('committee.editTitle') : t('committee.addTitle', { branch: target ? branchName(target.branch, language) : '' })}
      description={t('committee.phoneNote')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="bearer-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="bearer-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {save.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(save.error)} />}
        <Select label={t('committee.post')} error={fieldError(t, errors.post?.message)} {...form.register('post')}>
          {OFFICE_POSTS.map((p) => (
            <option key={p} value={p}>
              {t(`committee.post.${p}`)}
            </option>
          ))}
        </Select>
        <Input label={t('member.name')} error={fieldError(t, errors.name?.message)} {...form.register('name')} />
        <Input label={t('member.phone')} type="tel" inputMode="numeric" leadingIcon={Phone} error={fieldError(t, errors.phone?.message)} {...form.register('phone')} />
      </form>
    </Modal>
  );
}

/** Who holds which post in your branch and district, with a number to call. */
export function CommitteePage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const committee = useCommittee();
  const remove = useCommitteeMutation((id: string) => api.delete(`/committee/${id}`));
  const [target, setTarget] = useState<Target | null>(null);
  const [removing, setRemoving] = useState<OfficeBearer | null>(null);

  if (committee.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (committee.isError) return <ErrorState title={t('committee.error')} error={committee.error} onRetry={() => committee.refetch()} retrying={committee.isFetching} />;

  const groups = committee.data;
  if (groups.every((g) => g.bearers.length === 0 && !g.canEdit)) {
    return <EmptyState icon={UsersRound} title={t('committee.emptyTitle')} body={t('committee.emptyBody')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups
        .filter((g) => g.bearers.length > 0 || g.canEdit)
        .map((g) => (
          <Card as="section" key={g.branch.id} className="flex flex-col gap-2" aria-labelledby={`committee-${g.branch.id}`}>
            <h2 id={`committee-${g.branch.id}`} className="font-display text-xl font-semibold text-fg">
              {branchName(g.branch, language)}
              {g.branch.kind === 'district' && <span className="ml-2 text-sm font-normal text-fg-muted">{t('branchKind.district')}</span>}
            </h2>
            {g.bearers.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('committee.noneYet')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {g.bearers.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={b.name} size="md" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-semibold tracking-wide text-primary uppercase">{t(`committee.post.${b.post}`)}</span>
                      <span className="font-semibold break-words text-fg">{b.name}</span>
                      <span className="text-sm text-fg-muted tabular-nums">{formatPhone(b.phone)}</span>
                    </div>
                    <Tooltip content={t('directory.call', { name: b.name })}>
                      <a
                        href={`tel:${b.phone}`}
                        aria-label={t('directory.call', { name: b.name })}
                        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'size-touch shrink-0 px-0')}
                      >
                        <Icon icon={Phone} />
                      </a>
                    </Tooltip>
                    {g.canEdit && (
                      <div className="flex shrink-0">
                        <IconButton icon={Pencil} label={t('committee.edit', { name: b.name })} onClick={() => setTarget({ branch: g.branch, bearer: b })} />
                        <IconButton icon={Trash2} label={t('committee.remove', { name: b.name })} onClick={() => setRemoving(b)} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {g.canEdit && (
              <Button variant="ghost" size="sm" leadingIcon={Plus} className="self-start" onClick={() => setTarget({ branch: g.branch, bearer: null })}>
                {t('committee.add')}
              </Button>
            )}
          </Card>
        ))}

      <BearerModal target={target} onClose={() => setTarget(null)} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('committee.removeTitle', { name: removing?.name ?? '' })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leadingIcon={Trash2}
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(removing.id, {
                  onSuccess: () => {
                    toast.success(t('committee.removed'));
                    setRemoving(null);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              {t('family.removeConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
