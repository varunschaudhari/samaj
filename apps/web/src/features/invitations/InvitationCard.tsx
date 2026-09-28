import { type Honoree, type InvitationKind, type InvitationTheme, themeFor } from '@samaj/shared';
import { Icon } from '@/components/ui';
import { CalendarDays, Flower2, MapPin } from '@/components/ui/icons';
import { formatEventTime } from '@/features/community/events-api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { isRemembrance, muhuratText } from './kinds';
import { Ornament } from './Ornament';
import { THEMES, themeVars } from './themes';

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
  /** The card's look; the occasion's default when not given. */
  theme?: InvitationTheme | null;
  /** A personal invitation: "Dear Ramesh" above the rest. */
  addressee?: string | null;
}

/** A labelled list of names, as printed at the foot of a patrika. */
function Names({ label, names }: { label: string; names: string[] | undefined }) {
  if (!names?.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold tracking-wide text-(--c-muted) uppercase">{label}</span>
      {names.map((n, i) => (
        <span key={i} className="text-sm text-(--c-ink)">
          {n}
        </span>
      ))}
    </div>
  );
}

/**
 * The invitation as guests see it, like a printed card, in the family's
 * chosen theme: zari and kumkum, royal maroon, marigold, plain white; quiet
 * or lotus for a remembrance. With the
 * patrika's names when the family added them: whose occasion and whose
 * child, the elders invoked and blessing, and who invites.
 */
export function InvitationCard({ data, cancelled = false }: { data: CardData; cancelled?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const quiet = isRemembrance(data.kind);
  const theme = themeFor(data.kind, data.theme);
  const palette = THEMES[theme];
  const honorees = (data.honorees ?? []).filter((h) => h.name.trim());
  return (
    <article
      style={themeVars(theme)}
      className={cn(
        'relative overflow-hidden rounded-lg border-2 border-(--c-frame) bg-(--c-paper) p-5 text-center text-(--c-ink) sm:p-8 print:break-inside-avoid',
        palette.frameInner && 'outline-4 outline-offset-4 outline-(--c-frame-inner) outline-double',
      )}
    >
      {cancelled && (
        <span className="absolute top-3 right-3 rounded-full bg-danger px-3 py-0.5 text-xs font-semibold text-on-danger">{t('invite.cancelledBadge')}</span>
      )}
      <p className="text-sm font-semibold text-(--c-top)">{quiet ? t('invite.card.inMemory') : t('invite.card.ganesh')}</p>
      {quiet && data.memorial?.photoSrc && (
        <img src={data.memorial.photoSrc} alt="" className="mx-auto mt-4 size-28 rounded-full border-4 border-(--c-panel) object-cover shadow-card grayscale-[30%]" />
      )}
      {data.addressee && <p className="mt-3 font-display text-base font-semibold">{t('invite.card.dear', { name: data.addressee })}</p>}
      <h2 className="mt-3 font-display text-lg font-semibold text-(--c-accent)">{t(`invite.kind.${data.kind}`)}</h2>
      {honorees.length > 0 ? (
        <div className="mt-2 flex flex-col items-center gap-1">
          {honorees.map((h, i) => (
            <div key={i} className="flex flex-col items-center">
              {i > 0 && <span className="my-1 font-display text-lg text-(--c-muted)">{t('invite.card.with')}</span>}
              <p className="font-display text-3xl leading-tight font-semibold break-words sm:text-4xl">{h.name}</p>
              {h.detail && <p className="mt-1 max-w-md text-sm text-(--c-muted)">{h.detail}</p>}
            </div>
          ))}
        </div>
      ) : (
        data.forNames && <p className="mt-1 font-display text-3xl leading-tight font-semibold break-words sm:text-4xl">{data.forNames}</p>
      )}
      {quiet && data.memorial?.years && <p className="mt-1 text-sm text-(--c-muted)">{data.memorial.years}</p>}
      <p className="mx-auto mt-3 max-w-md text-sm text-(--c-muted)">
        {/* Invited by name: "invites you", not "you and your family". */}
        {t(quiet ? (data.addressee ? 'invite.card.remembranceInvitePerson' : 'invite.card.remembranceInvite') : data.addressee ? 'invite.card.invitesPerson' : 'invite.card.invitesYou', { name: data.hostName })}
      </p>
      <Ornament kind={palette.ornament} className="mx-auto mt-5 w-full max-w-xs" />
      <ol className="mx-auto mt-5 flex max-w-md flex-col gap-3 text-left">
        {data.functions.map((f, i) => (
          <li key={f.id ?? i} className="flex flex-col gap-1 rounded-md border border-(--c-panel-line) bg-(--c-panel) p-3">
            <span className="font-display text-lg font-semibold">{f.name || '…'}</span>
            {f.startsAt && (
              <span className="flex items-start gap-2 text-sm">
                <Icon icon={CalendarDays} size="sm" className="mt-0.5 shrink-0 text-(--c-muted)" />
                {formatEventTime(f.startsAt, f.endsAt, language)}
              </span>
            )}
            {f.muhuratAt && f.startsAt && (
              <span className="flex items-start gap-2 text-sm font-semibold text-(--c-highlight)">
                <Icon icon={Flower2} size="sm" className="mt-0.5 shrink-0" />
                {t('invite.card.muhurat', { time: muhuratText(f.muhuratAt, f.startsAt, language) })}
              </span>
            )}
            {f.venue && (
              <span className="flex items-start gap-2 text-sm">
                <Icon icon={MapPin} size="sm" className="mt-0.5 shrink-0 text-(--c-muted)" />
                <span>
                  {f.venue}
                  {f.mapUrl && (
                    <>
                      {' · '}
                      <a href={f.mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-(--c-accent) underline-offset-2 hover:underline print:hidden">
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
      {data.message && <p className="mx-auto mt-5 max-w-md text-base whitespace-pre-line">{data.message}</p>}
      {data.kripa?.length || data.blessings?.length || data.inviters?.length ? (
        <div className="mx-auto mt-6 grid max-w-md gap-4 border-t border-(--c-panel-line) pt-4 sm:grid-cols-2">
          <Names label={t('invite.card.kripa')} names={data.kripa} />
          <Names label={t('invite.card.blessings')} names={data.blessings} />
          <Names label={t(quiet ? 'invite.card.grieving' : 'invite.card.inviters')} names={data.inviters} />
        </div>
      ) : null}
    </article>
  );
}
