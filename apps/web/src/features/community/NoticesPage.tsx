import { NOTICE_KINDS, type Notice, type NoticeKind, can } from '@samaj/shared';
import { Megaphone, Plus, Trash2 } from '@/components/ui/icons';
import { useState } from 'react';
import { Button, Chip, ChipRow, EmptyState, ErrorState, Modal, toast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useErrorMessage, useT } from '@/i18n';
import { KIND_STYLE, NoticeCard, NoticeCardSkeleton } from './NoticeCard';
import { NoticeFormModal } from './NoticeFormModal';
import { useNotices, useRemoveNotice } from './notices-api';

export function NoticesPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const [kind, setKind] = useState<NoticeKind | ''>('');
  const notices = useNotices(kind);
  const remove = useRemoveNotice();
  const [editing, setEditing] = useState<Notice | 'new' | null>(null);
  const [removing, setRemoving] = useState<Notice | null>(null);
  const canPost = me.data ? can(me.data.role, 'notice:publish') : false;

  const pinned = notices.data?.pages[0]?.pinned ?? [];
  const items = notices.data?.pages.flatMap((p) => p.items) ?? [];
  const all = [...pinned, ...items];

  let body;
  if (notices.isPending) {
    body = (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <NoticeCardSkeleton key={i} />
        ))}
      </ul>
    );
  } else if (notices.isError && all.length === 0) {
    body = <ErrorState title={t('notices.error')} error={notices.error} onRetry={() => notices.refetch()} retrying={notices.isFetching} />;
  } else if (all.length === 0) {
    body = kind ? (
      <EmptyState icon={Megaphone} title={t('notices.noneOfKind')} body={t('notices.noneOfKindBody')} action={<Button variant="secondary" onClick={() => setKind('')}>{t('notices.showAll')}</Button>} />
    ) : (
      <EmptyState
        icon={Megaphone}
        title={t('notices.emptyTitle')}
        body={canPost ? t('notices.emptyBodyCommittee') : t('notices.emptyBody')}
        action={canPost ? <Button leadingIcon={Plus} onClick={() => setEditing('new')}>{t('notices.new')}</Button> : undefined}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3" aria-busy={notices.isPlaceholderData || undefined}>
          {all.map((n) => (
            <NoticeCard key={n.id} notice={n} onEdit={() => setEditing(n)} onRemove={() => setRemoving(n)} />
          ))}
        </ul>
        {notices.hasNextPage && (
          <Button variant="secondary" className="self-center" loading={notices.isFetchingNextPage} onClick={() => notices.fetchNextPage()}>
            {t('notices.more')}
          </Button>
        )}
      </div>
    );
  }

  const filters: (NoticeKind | '')[] = ['', ...NOTICE_KINDS];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChipRow label={t('notices.kind')} className="min-w-0 sm:flex-1">
          {filters.map((k) => (
            <Chip key={k || 'all'} selected={kind === k} onClick={() => setKind(k)} icon={k ? KIND_STYLE[k].icon : undefined}>
              {k ? t(`notices.kind.${k}`) : t('notices.all')}
            </Chip>
          ))}
        </ChipRow>
        {canPost && all.length > 0 && (
          <Button leadingIcon={Plus} onClick={() => setEditing('new')} className="self-start">
            {t('notices.new')}
          </Button>
        )}
      </div>
      {body}

      <NoticeFormModal target={editing} onClose={() => setEditing(null)} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('notices.removeTitle')}
        description={removing?.title}
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
                    toast.success(t('notices.removed'));
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
