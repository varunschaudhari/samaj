import { zodResolver } from '@hookform/resolvers/zod';
import { NOTICE_KINDS, type Notice, type NoticeInput, type PublicUser, isGlobalRole, noticeInputSchema } from '@samaj/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input, Modal, Select, Textarea, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { FormAlert } from '@/features/auth/FormAlert';
import { applyServerIssues, fieldError } from '@/features/auth/form-errors';
import { branchName, useBranches } from '@/features/branches/api';
import { useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useSaveNotice } from './notices-api';

const FIELDS = ['title', 'body', 'kind', 'branchId', 'pinned'] as const;

function defaults(notice: Notice | null, me: PublicUser | null | undefined): NoticeInput {
  return notice
    ? { title: notice.title, body: notice.body, kind: notice.kind, branchId: notice.branch.id, pinned: notice.pinned }
    : { title: '', body: '', kind: 'announcement', branchId: me?.branchId ?? '', pinned: false };
}

/** target: null closed, 'new' to post, or the notice to edit. */
export function NoticeFormModal({ target, onClose }: { target: Notice | 'new' | null; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const me = useMe();
  const branches = useBranches();
  const save = useSaveNotice();
  const notice = target && target !== 'new' ? target : null;
  const form = useForm({ resolver: zodResolver(noticeInputSchema), defaultValues: defaults(notice, me.data) });
  const { errors } = form.formState;

  useEffect(() => {
    if (target) {
      form.reset(defaults(notice, me.data));
      save.reset();
    }
    // Once per opening.
  }, [target]);

  // Committee members post to their own branch and the towns under it; admins anywhere.
  // The tree is two levels deep, so "under it" is its direct children.
  const user = me.data;
  const postable = (branches.data ?? []).filter((b) => (user && isGlobalRole(user.role)) || b.id === user?.branchId || b.parentId === user?.branchId);

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { id: notice?.id ?? null, input: values },
      {
        onSuccess: () => {
          toast.success(t(notice ? 'notices.saved' : 'notices.posted'));
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
      title={notice ? t('notices.editTitle') : t('notices.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="notice-form" loading={save.isPending}>
            {notice ? t('common.save') : t('notices.post')}
          </Button>
        </>
      }
    >
      <form id="notice-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {save.isError && !FIELDS.some((f) => errors[f]?.type === 'server') && <FormAlert message={errorMessage(save.error)} />}
        <Input label={t('notices.title')} error={fieldError(t, errors.title?.message)} {...form.register('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('notices.kind')} error={fieldError(t, errors.kind?.message)} {...form.register('kind')}>
            {NOTICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`notices.kind.${k}`)}
              </option>
            ))}
          </Select>
          <Select label={t('notices.branch')} hint={t('notices.branchHint')} error={fieldError(t, errors.branchId?.message)} {...form.register('branchId')}>
            {postable.map((b) => (
              <option key={b.id} value={b.id}>
                {branchName(b, language)}
                {b.kind === 'district' ? ` (${t('branchKind.district')})` : ''}
              </option>
            ))}
          </Select>
        </div>
        <Textarea label={t('notices.body')} rows={6} error={fieldError(t, errors.body?.message)} {...form.register('body')} />
        <div className="flex flex-col gap-1.5">
          <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-sm bg-surface-muted px-3 text-sm text-fg">
            <input type="checkbox" className="size-5 shrink-0 accent-primary" {...form.register('pinned')} />
            {t('notices.pinLabel')}
          </label>
          {errors.pinned?.message && <p className="text-sm text-danger">{fieldError(t, errors.pinned.message)}</p>}
        </div>
      </form>
    </Modal>
  );
}
