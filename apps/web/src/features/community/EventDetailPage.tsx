import { MAX_RSVP_PEOPLE } from '@samaj/shared';
import { ArrowLeft, CalendarDays, CircleCheck, Clock, ExternalLink, MapPin, Minus, Pencil, Plus, Trash2, Users } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, CardTitle, EmptyState, ErrorState, Icon, IconButton, Modal, Skeleton, buttonVariants, toast } from '@/components/ui';
import { branchName } from '@/features/branches/api';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { EventFormModal } from './EventFormModal';
import { formatEventTime, useEvent, useRemoveEvent, useRsvp } from './events-api';

/** How many from the family are coming: a stepper, then one button to save. */
function RsvpPanel({ id, current, closed }: { id: string; current: number; closed: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const rsvp = useRsvp(id);
  const [people, setPeople] = useState(current || 2);
  useEffect(() => setPeople(current || 2), [current]);

  if (closed) return <p className="text-sm text-fg-muted">{t('events.rsvpClosed')}</p>;

  const save = (count: number) =>
    rsvp.mutate(count, {
      onSuccess: () => toast.success(count === 0 ? t('events.notComing') : t('events.rsvpSaved', { count })),
      onError: (err) => toast.error(errorMessage(err)),
    });

  return (
    <Card variant="raised" className="flex flex-col gap-3">
      <CardTitle>{current > 0 ? t('events.youreComing', { count: current }) : t('events.areYouComing')}</CardTitle>
      <div className="flex items-center gap-3">
        <IconButton icon={Minus} label={t('events.fewer')} variant="secondary" disabled={people <= 1} onClick={() => setPeople((p) => Math.max(1, p - 1))} />
        <p className="min-w-24 text-center tabular-nums" aria-live="polite">
          <span className="font-display text-3xl font-semibold text-fg">{formatNumber(people, language)}</span>
          <span className="block text-xs text-fg-muted">{t('events.fromFamily')}</span>
        </p>
        <IconButton icon={Plus} label={t('events.more')} variant="secondary" disabled={people >= MAX_RSVP_PEOPLE} onClick={() => setPeople((p) => Math.min(MAX_RSVP_PEOPLE, p + 1))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button leadingIcon={CircleCheck} loading={rsvp.isPending} disabled={people === current} onClick={() => save(people)}>
          {current > 0 ? t('events.update') : t('events.coming')}
        </Button>
        {current > 0 && (
          <Button variant="ghost" disabled={rsvp.isPending} onClick={() => save(0)}>
            {t('events.cantCome')}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function EventDetailPage() {
  const { id = '' } = useParams();
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const event = useEvent(id);
  const remove = useRemoveEvent();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const back = (
    <Link to="/community/events" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start px-2')}>
      <Icon icon={ArrowLeft} />
      {t('events.all')}
    </Link>
  );

  if (event.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }
  if (event.isError) {
    if (event.error instanceof ApiError && event.error.status === 404) {
      return <EmptyState icon={CalendarDays} title={t('events.goneTitle')} body={t('events.goneBody')} action={back} />;
    }
    return <ErrorState title={t('events.error')} error={event.error} onRetry={() => event.refetch()} retrying={event.isFetching} />;
  }

  const e = event.data;
  const ended = new Date(e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 12 * 3_600_000)).getTime() < Date.now();

  return (
    <div className="flex flex-col gap-4">
      {back}
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* h2: "Community" above is the page's h1. */}
          <h2 className="font-display text-2xl font-semibold break-words text-fg">{e.title}</h2>
          <p className="text-sm text-fg-muted">
            {branchName(e.branch, language)} · {t('events.by', { name: e.createdByName })}
          </p>
        </div>
        {e.permissions.canEdit && (
          <div className="flex shrink-0">
            <IconButton icon={Pencil} label={t('events.editTitle')} onClick={() => setEditing(true)} />
            <IconButton icon={Trash2} label={t('events.remove')} onClick={() => setRemoving(true)} />
          </div>
        )}
      </header>

      <Card className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-fg">
          <Icon icon={Clock} className="mt-0.5 text-primary" />
          <span className="tabular-nums">{formatEventTime(e.startsAt, e.endsAt, language)}</span>
        </p>
        <p className="flex items-start gap-2 text-fg">
          <Icon icon={MapPin} className="mt-0.5 text-primary" />
          <span className="break-words">{e.venue}</span>
        </p>
        {e.mapUrl && (
          <a href={e.mapUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')}>
            <Icon icon={ExternalLink} />
            {t('events.openMap')}
          </a>
        )}
        {e.rsvpEnabled && (
          <p className="flex items-center gap-2 text-sm text-fg-muted tabular-nums">
            <Icon icon={Users} size="sm" />
            {t('events.headcountFamilies', { count: e.headcount, families: e.families })}
          </p>
        )}
      </Card>

      {e.rsvpEnabled && <RsvpPanel id={e.id} current={e.myPeople} closed={ended} />}

      {e.description && <p className="max-w-prose break-words whitespace-pre-line text-fg">{e.description}</p>}

      {e.attendees && (
        <section className="flex flex-col gap-2">
          <h3 className="font-display text-lg font-semibold text-fg">{t('events.attendees')}</h3>
          {e.families > e.attendees.length && (
            <p className="text-sm text-fg-muted">{t('events.attendeesLatest', { shown: e.attendees.length, total: e.families })}</p>
          )}
          {e.attendees.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('events.noAttendees')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {e.attendees.map((a) => (
                <li key={a.familyId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link to={`/families/${a.familyId}`} className="min-w-0 flex-1 truncate text-fg hover:underline">
                    {t('family.title', { name: a.headName })} <span className="text-fg-muted">· {a.place}</span>
                  </Link>
                  <span className="font-semibold text-fg tabular-nums">{formatNumber(a.people, language)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <EventFormModal target={editing ? e : null} onClose={() => setEditing(false)} />
      <Modal
        open={removing}
        onClose={() => setRemoving(false)}
        title={t('events.removeTitle')}
        description={t('events.removeBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leadingIcon={Trash2}
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(e.id, {
                  onSuccess: () => {
                    toast.success(t('events.removed'));
                    navigate('/community/events', { replace: true });
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
