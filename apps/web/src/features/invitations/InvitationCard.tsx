import type { InvitationKind } from '@samaj/shared';
import { Icon } from '@/components/ui';
import { CalendarDays, MapPin } from '@/components/ui/icons';
import { formatEventTime } from '@/features/community/events-api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { isRemembrance } from './kinds';

export interface CardData {
  kind: InvitationKind;
  forNames: string | null;
  message: string | null;
  hostName: string;
  functions: { id?: string; name: string; startsAt: string | null; endsAt: string | null; venue: string; mapUrl: string | null }[];
}

/**
 * The invitation as guests see it, like a printed card: zari border and
 * kumkum for a celebration, plain and quiet for a remembrance.
 */
export function InvitationCard({ data, cancelled = false }: { data: CardData; cancelled?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const quiet = isRemembrance(data.kind);
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border p-5 text-center sm:p-8 print:break-inside-avoid',
        quiet ? 'border-line-strong bg-surface-muted' : 'border-zari bg-surface outline-4 outline-offset-4 outline-zari-soft outline-double',
      )}
    >
      {cancelled && (
        <span className="absolute top-3 right-3 rounded-full bg-danger px-3 py-0.5 text-xs font-semibold text-on-danger">{t('invite.cancelledBadge')}</span>
      )}
      <p className={cn('text-sm font-semibold', quiet ? 'text-fg-muted' : 'text-kumkum')}>{quiet ? t('invite.card.inMemory') : t('invite.card.ganesh')}</p>
      <h2 className={cn('mt-3 font-display text-lg font-semibold', quiet ? 'text-fg' : 'text-primary')}>{t(`invite.kind.${data.kind}`)}</h2>
      {data.forNames && <p className="mt-1 font-display text-3xl leading-tight font-semibold break-words text-fg sm:text-4xl">{data.forNames}</p>}
      <p className="mx-auto mt-3 max-w-md text-sm text-fg-muted">
        {quiet ? t('invite.card.remembranceInvite', { name: data.hostName }) : t('invite.card.invitesYou', { name: data.hostName })}
      </p>
      {!quiet && <div className="zari-border mx-auto mt-5 max-w-xs" aria-hidden="true" />}
      <ol className="mx-auto mt-5 flex max-w-md flex-col gap-3 text-left">
        {data.functions.map((f, i) => (
          <li key={f.id ?? i} className="flex flex-col gap-1 rounded-md border border-line bg-surface p-3">
            <span className="font-display text-lg font-semibold text-fg">{f.name || '…'}</span>
            {f.startsAt && (
              <span className="flex items-start gap-2 text-sm text-fg">
                <Icon icon={CalendarDays} size="sm" className="mt-0.5 shrink-0 text-fg-muted" />
                {formatEventTime(f.startsAt, f.endsAt, language)}
              </span>
            )}
            {f.venue && (
              <span className="flex items-start gap-2 text-sm text-fg">
                <Icon icon={MapPin} size="sm" className="mt-0.5 shrink-0 text-fg-muted" />
                <span>
                  {f.venue}
                  {f.mapUrl && (
                    <>
                      {' · '}
                      <a href={f.mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline print:hidden">
                        {t('invite.card.map')}
                      </a>
                    </>
                  )}
                </span>
              </span>
            )}
          </li>
        ))}
      </ol>
      {data.message && <p className="mx-auto mt-5 max-w-md text-base whitespace-pre-line text-fg">{data.message}</p>}
    </article>
  );
}
