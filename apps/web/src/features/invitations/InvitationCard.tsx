import type { Honoree, InvitationKind } from '@samaj/shared';
import { Icon } from '@/components/ui';
import { CalendarDays, Flower2, MapPin } from '@/components/ui/icons';
import { formatEventTime } from '@/features/community/events-api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { isRemembrance, muhuratText } from './kinds';

export interface CardData {
  kind: InvitationKind;
  forNames: string | null;
  message: string | null;
  hostName: string;
  functions: { id?: string; name: string; startsAt: string | null; endsAt: string | null; venue: string; mapUrl: string | null; muhuratAt?: string | null }[];
  honorees?: Honoree[];
  kripa?: string[];
  blessings?: string[];
  inviters?: string[];
  /** The one remembered: their years and photo. */
  memorial?: { years: string | null; photoSrc: string | null } | null;
}

/** A labelled list of names, as printed at the foot of a patrika. */
function Names({ label, names }: { label: string; names: string[] | undefined }) {
  if (!names?.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{label}</span>
      {names.map((n, i) => (
        <span key={i} className="text-sm text-fg">
          {n}
        </span>
      ))}
    </div>
  );
}

/**
 * The invitation as guests see it, like a printed card: zari border and
 * kumkum for a celebration, plain and quiet for a remembrance. With the
 * patrika's names when the family added them: whose occasion and whose
 * child, the elders invoked and blessing, and who invites.
 */
export function InvitationCard({ data, cancelled = false }: { data: CardData; cancelled?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const quiet = isRemembrance(data.kind);
  const honorees = (data.honorees ?? []).filter((h) => h.name.trim());
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
      {quiet && data.memorial?.photoSrc && (
        <img src={data.memorial.photoSrc} alt="" className="mx-auto mt-4 size-28 rounded-full border-4 border-surface object-cover shadow-card grayscale-[30%]" />
      )}
      <h2 className={cn('mt-3 font-display text-lg font-semibold', quiet ? 'text-fg' : 'text-primary')}>{t(`invite.kind.${data.kind}`)}</h2>
      {honorees.length > 0 ? (
        <div className="mt-2 flex flex-col items-center gap-1">
          {honorees.map((h, i) => (
            <div key={i} className="flex flex-col items-center">
              {i > 0 && <span className="my-1 font-display text-lg text-fg-muted">{t('invite.card.with')}</span>}
              <p className="font-display text-3xl leading-tight font-semibold break-words text-fg sm:text-4xl">{h.name}</p>
              {h.detail && <p className="mt-1 max-w-md text-sm text-fg-muted">{h.detail}</p>}
            </div>
          ))}
        </div>
      ) : (
        data.forNames && <p className="mt-1 font-display text-3xl leading-tight font-semibold break-words text-fg sm:text-4xl">{data.forNames}</p>
      )}
      {quiet && data.memorial?.years && <p className="mt-1 text-sm text-fg-muted">{data.memorial.years}</p>}
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
            {f.muhuratAt && f.startsAt && (
              <span className="flex items-start gap-2 text-sm font-semibold text-kumkum">
                <Icon icon={Flower2} size="sm" className="mt-0.5 shrink-0" />
                {t('invite.card.muhurat', { time: muhuratText(f.muhuratAt, f.startsAt, language) })}
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
      {(data.kripa?.length || data.blessings?.length || data.inviters?.length) ? (
        <div className="mx-auto mt-6 grid max-w-md gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Names label={t('invite.card.kripa')} names={data.kripa} />
          <Names label={t('invite.card.blessings')} names={data.blessings} />
          <Names label={t(quiet ? 'invite.card.grieving' : 'invite.card.inviters')} names={data.inviters} />
        </div>
      ) : null}
    </article>
  );
}
