import type { Notice, NoticeKind } from '@samaj/shared';
import { CalendarClock, Flower2, type AppIcon, Megaphone, PartyPopper, Pencil, Pin, Trash2 } from '@/components/ui/icons';
import { Badge, Card, IconButton, Skeleton } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { formatDate, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

export const KIND_STYLE: Record<NoticeKind, { icon: AppIcon; tone: 'primary' | 'info' | 'zari' | 'neutral' }> = {
  announcement: { icon: Megaphone, tone: 'primary' },
  meeting: { icon: CalendarClock, tone: 'info' },
  celebration: { icon: PartyPopper, tone: 'zari' },
  // Quiet on purpose: a condolence shouldn't look like the others.
  condolence: { icon: Flower2, tone: 'neutral' },
};

interface NoticeCardProps {
  notice: Notice;
  onEdit: () => void;
  onRemove: () => void;
}

export function NoticeCard({ notice, onEdit, onRemove }: NoticeCardProps) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const style = KIND_STYLE[notice.kind];

  return (
    <Card as="li" variant={notice.pinned ? 'raised' : 'outlined'} className={cn('flex flex-col gap-2', notice.pinned && 'border-primary')}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Badge tone={style.tone} icon={style.icon}>
            {t(`notices.kind.${notice.kind}`)}
          </Badge>
          {notice.pinned && (
            <Badge tone="primary" icon={Pin}>
              {t('notices.pinned')}
            </Badge>
          )}
        </div>
        {notice.permissions.canEdit && (
          <div className="-mt-2 -mr-2 flex shrink-0">
            <IconButton icon={Pencil} label={t('notices.edit', { title: notice.title })} onClick={onEdit} />
            <IconButton icon={Trash2} label={t('notices.remove', { title: notice.title })} onClick={onRemove} />
          </div>
        )}
      </div>
      <h2 className="font-display text-lg font-semibold break-words text-fg">{notice.title}</h2>
      <p className="max-w-prose break-words whitespace-pre-line text-fg">{notice.body}</p>
      <p className="text-xs text-fg-muted tabular-nums">
        {branchName(notice.branch, language)} · {notice.authorName} · {formatDate(notice.publishedAt, language)}
        {notice.editedAt && ` · ${t('notices.edited')}`}
      </p>
    </Card>
  );
}

export function NoticeCardSkeleton() {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3 w-1/3" />
    </li>
  );
}

