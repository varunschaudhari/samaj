import { type Notice, type PublicUser, can, isGlobalRole } from '@samaj/shared';
import {
  BookUser,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  HeartHandshake,
  type LucideIcon,
  Megaphone,
  PhoneCall,
  RotateCw,
  Search,
  UsersRound,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { branchName, useBranches } from '@/features/branches/api';
import { EventCard, EventCardSkeleton } from '@/features/community/EventCard';
import { useEvents } from '@/features/community/events-api';
import { KIND_STYLE } from '@/features/community/NoticeCard';
import { useNotices } from '@/features/community/notices-api';
import { usePendingCount } from '@/features/families/api';
import { VerificationNotice } from '@/features/families/VerificationNotice';
import { type MessageKey, formatDate, formatNumber, useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** The first word of a name, for a friendly greeting. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function Hero({ user, canBrowse }: { user: PublicUser; canBrowse: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const navigate = useNavigate();
  const branches = useBranches();
  const branch = branches.data?.find((b) => b.id === user.branchId);
  const [q, setQ] = useState('');

  const search = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    void navigate(term ? `/directory?q=${encodeURIComponent(term)}` : '/directory');
  };

  return (
    // Edge to edge on phones, a rounded panel from md up.
    <div className="-mx-4 -mt-5 sm:-mx-6 md:mx-0 md:mt-0">
      <section className="relative overflow-hidden bg-hero px-4 pt-6 pb-7 text-on-hero sm:px-6 md:rounded-t-lg md:px-8 md:pt-8">
        {/* The brand's zari ring, large and faint, as texture. */}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute -top-10 -right-12 size-56 opacity-15" aria-hidden="true">
          <circle cx="50" cy="50" r="30" fill="none" strokeWidth="9" className="stroke-zari" />
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="1.5" strokeDasharray="2 4" className="stroke-zari" />
          <circle cx="50" cy="50" r="9" className="fill-zari" />
        </svg>
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-on-hero-muted">{t('home.greeting')}</span>
              <span className="font-display text-3xl leading-tight font-semibold break-words">{firstName(user.name)}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-on-hero-muted">
              {branch ? <span>{branchName(branch, language)}</span> : <Skeleton className="h-4 w-24 opacity-30" />}
              <span aria-hidden="true">·</span>
              <span>{t(`role.${user.role}`)}</span>
            </p>
          </div>
          {canBrowse && (
            <form role="search" onSubmit={search} className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t('directory.searchLabel')}</span>
                <Icon icon={Search} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
                <input
                  type="search"
                  enterKeyHint="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('home.searchPlaceholder')}
                  className="h-12 w-full rounded-md border border-transparent bg-surface pr-3 pl-10 text-base text-fg shadow-raised placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zari"
                />
              </label>
              <Button type="submit" size="lg" className="bg-zari text-fg hover:bg-zari-soft" aria-label={t('home.searchGo')}>
                <Icon icon={Search} />
              </Button>
            </form>
          )}
        </div>
      </section>
      <div className="zari-border md:rounded-b-lg" aria-hidden="true" />
    </div>
  );
}

interface Tile {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  tone: string;
}

function QuickTiles({ user, canBrowse }: { user: PublicUser; canBrowse: boolean }) {
  const t = useT();
  const tiles: Tile[] = [
    ...(canBrowse ? [{ to: '/directory', label: 'nav.directory', icon: BookUser, tone: 'bg-primary-soft text-primary' } as const] : []),
    { to: `/families/${user.familyId}`, label: 'nav.family', icon: UsersRound, tone: 'bg-zari-soft text-zari-fg' },
    { to: '/community/events', label: 'community.events', icon: CalendarDays, tone: 'bg-info-soft text-info' },
    { to: '/community/notices', label: 'community.notices', icon: Megaphone, tone: 'bg-primary-soft text-primary' },
    ...(canBrowse ? [{ to: '/matrimony', label: 'nav.matrimony', icon: HeartHandshake, tone: 'bg-kumkum-soft text-kumkum' } as const] : []),
    { to: '/community/committee', label: 'home.whoToCall', icon: PhoneCall, tone: 'bg-success-soft text-success' },
  ];
  return (
    <nav aria-label={t('home.quickLinks')}>
      <ul className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.to}>
            <Link
              to={tile.to}
              className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-line bg-surface px-1 py-3 text-center shadow-card transition-colors duration-150 hover:border-line-strong active:bg-surface-muted"
            >
              <span className={cn('flex size-11 items-center justify-center rounded-full', tile.tone)}>
                <Icon icon={tile.icon} size="lg" />
              </span>
              <span className="text-sm leading-tight font-semibold text-fg">{t(tile.label)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Committee and admins: what's waiting for them. */
function ReviewCard({ user }: { user: PublicUser }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const pending = usePendingCount(true);
  const href = isGlobalRole(user.role) ? '/admin/review' : '/review';
  const count = pending.data ?? 0;

  return (
    <section className="flex items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-card">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-full', count > 0 ? 'bg-kumkum-soft text-kumkum' : 'bg-success-soft text-success')}>
        <Icon icon={ClipboardCheck} size="lg" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-semibold text-fg">{t('home.review.title')}</h2>
        <p className="text-sm text-fg-muted tabular-nums">
          {pending.isPending ? (
            <Skeleton className="mt-1 h-4 w-32" />
          ) : pending.isError ? (
            t('home.review.unknown')
          ) : count > 0 ? (
            t('home.review.waiting', { count: count > 999 ? '999+' : formatNumber(count, language) })
          ) : (
            t('home.review.none')
          )}
        </p>
      </div>
      <Link to={href} className={cn(buttonVariants({ variant: count > 0 ? 'primary' : 'secondary', size: 'sm' }), 'shrink-0')}>
        {t('home.review.open')}
      </Link>
    </section>
  );
}

function SectionHeading({ title, to, id }: { title: string; to: string; id: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="font-display text-xl font-semibold text-fg">
        {title}
      </h2>
      <Link to={to} className="flex min-h-touch items-center gap-0.5 px-1 text-sm font-semibold text-primary hover:underline">
        {t('home.seeAll')}
        <Icon icon={ChevronRight} size="sm" />
      </Link>
    </div>
  );
}

function InlineError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-4 text-sm text-fg-muted">
      {t('home.loadFailed')}
      <Button variant="secondary" size="sm" leadingIcon={RotateCw} onClick={onRetry} loading={retrying}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

function UpcomingEvents() {
  const t = useT();
  const events = useEvents('upcoming');
  const next = (events.data ?? []).slice(0, 2);

  let body;
  if (events.isPending) {
    body = (
      <ul className="grid gap-3" aria-busy="true" aria-label={t('common.loading')}>
        <EventCardSkeleton />
        <EventCardSkeleton />
      </ul>
    );
  } else if (events.isError) {
    body = <InlineError onRetry={() => events.refetch()} retrying={events.isFetching} />;
  } else if (next.length === 0) {
    body = <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">{t('home.noEvents')}</p>;
  } else {
    body = (
      <ul className="grid gap-3">
        {next.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </ul>
    );
  }
  return (
    <section aria-labelledby="home-events" className="flex flex-col gap-2">
      <SectionHeading id="home-events" title={t('home.upcoming')} to="/community/events" />
      {body}
    </section>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const style = KIND_STYLE[notice.kind];
  return (
    <li>
      <Link to="/community/notices" className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
          <Icon icon={style.icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 font-semibold break-words text-fg">{notice.title}</span>
          <span className="text-xs text-fg-muted tabular-nums">
            {t(`notices.kind.${notice.kind}`)} · {branchName(notice.branch, language)} · {formatDate(notice.publishedAt, language)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function LatestNotices() {
  const t = useT();
  const notices = useNotices('');
  const first = notices.data?.pages[0];
  const latest = [...(first?.pinned ?? []), ...(first?.items ?? [])].slice(0, 3);

  let body;
  if (notices.isPending) {
    body = (
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5 pt-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (notices.isError) {
    body = <InlineError onRetry={() => notices.refetch()} retrying={notices.isFetching} />;
  } else if (latest.length === 0) {
    body = <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">{t('home.noNotices')}</p>;
  } else {
    body = (
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-card">
        {latest.map((n) => (
          <NoticeRow key={n.id} notice={n} />
        ))}
      </ul>
    );
  }
  return (
    <section aria-labelledby="home-notices" className="flex flex-col gap-2">
      <SectionHeading id="home-notices" title={t('home.latestNotices')} to="/community/notices" />
      {body}
    </section>
  );
}

export function HomePage() {
  const me = useMe();
  const user = me.data;
  if (!user) return null;

  // Members of families still being checked can't browse yet; show them where they stand.
  const canBrowse = user.role !== 'member' || user.familyStatus === 'verified';
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Hero user={user} canBrowse={canBrowse} />
      {!canBrowse && <VerificationNotice user={user} />}
      {can(user.role, 'member:verify') && <ReviewCard user={user} />}
      <QuickTiles user={user} canBrowse={canBrowse} />
      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingEvents />
        <LatestNotices />
      </div>
    </div>
  );
}
