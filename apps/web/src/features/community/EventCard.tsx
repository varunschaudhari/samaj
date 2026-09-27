import type { EventSummary } from '@samaj/shared';
import { CircleCheck, MapPin, Users } from '@/components/ui/icons';
import { Link } from 'react-router';
import { Card, Icon, Skeleton } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { useLanguageStore, useT } from '@/i18n';
import { dateParts, formatEventTime } from './events-api';

export function EventCard({ event }: { event: EventSummary }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const { day, month } = dateParts(event.startsAt, language);

  return (
    <Card as="li" className="relative flex gap-4 transition-colors duration-150 hover:border-line-strong">
      {/* Calendar block: the date is what people scan for. */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center self-start rounded-md bg-primary-soft py-2 text-primary" aria-hidden="true">
        <span className="font-display text-2xl leading-none font-semibold tabular-nums">{day}</span>
        <span className="mt-1 text-xs font-semibold uppercase">{month}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-display text-lg font-semibold break-words text-fg">
          <Link to={`/community/events/${event.id}`} className="after:absolute after:inset-0 after:rounded-md hover:underline">
            {event.title}
          </Link>
        </h2>
        <p className="text-sm text-fg tabular-nums">{formatEventTime(event.startsAt, event.endsAt, language)}</p>
        <p className="flex items-center gap-1 text-sm text-fg-muted">
          <Icon icon={MapPin} size="sm" />
          <span className="truncate">{event.venue}</span>
        </p>
        <p className="text-xs text-fg-muted">{branchName(event.branch, language)}</p>
        {event.rsvpEnabled && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1 text-fg-muted tabular-nums">
              <Icon icon={Users} size="sm" />
              {t('events.headcount', { count: event.headcount })}
            </span>
            {event.myPeople > 0 && (
              <span className="flex items-center gap-1 font-semibold text-success tabular-nums">
                <Icon icon={CircleCheck} size="sm" />
                {t('events.youreComing', { count: event.myPeople })}
              </span>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}

export function EventCardSkeleton() {
  return (
    <li className="flex gap-4 rounded-md border border-line bg-surface p-4" aria-hidden="true">
      <Skeleton className="h-16 w-14 rounded-md" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    </li>
  );
}
