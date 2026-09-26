import { BookUser, CalendarDays, HeartHandshake, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Icon } from '@/components/ui';
import { type MessageKey, useT } from '@/i18n';

const POINTS: { icon: LucideIcon; label: MessageKey }[] = [
  { icon: BookUser, label: 'auth.hero.directory' },
  { icon: CalendarDays, label: 'auth.hero.events' },
  { icon: HeartHandshake, label: 'auth.hero.matrimony' },
];

/**
 * Sign-in, signup, invite and reset. Phones: a peacock band with the name and
 * a zari border, and the form on a card that overlaps it. Wide screens: the
 * band becomes a panel on the left.
 */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative flex flex-col overflow-hidden bg-hero text-on-hero lg:min-h-dvh">
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute -right-16 -bottom-20 size-72 opacity-10 lg:size-[28rem]" aria-hidden="true">
          <circle cx="50" cy="50" r="30" fill="none" strokeWidth="9" className="stroke-zari" />
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="1.5" strokeDasharray="2 4" className="stroke-zari" />
          <circle cx="50" cy="50" r="9" className="fill-zari" />
        </svg>
        <header className="relative flex items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-10 lg:py-6">
          <BrandMark onHero />
          <LanguageSwitch onHero />
        </header>
        <div className="relative flex flex-col gap-2 px-4 pt-2 pb-14 sm:px-6 lg:flex-1 lg:justify-center lg:gap-6 lg:px-10 lg:pb-10">
          <p className="max-w-md font-display text-2xl leading-snug font-semibold lg:text-4xl">{t('auth.hero.title')}</p>
          <ul className="hidden flex-col gap-3 lg:flex">
            {POINTS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-lg text-on-hero-muted">
                <span className="flex size-10 items-center justify-center rounded-full bg-on-hero/10 text-on-hero">
                  <Icon icon={p.icon} />
                </span>
                {t(p.label)}
              </li>
            ))}
          </ul>
        </div>
        <div className="zari-border lg:hidden" aria-hidden="true" />
      </div>

      <main className="relative z-10 -mt-8 flex flex-1 flex-col items-center px-4 pb-12 sm:px-6 lg:mt-0 lg:justify-center lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-6 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold text-fg">{title}</h1>
            <p className="text-fg-muted">{subtitle}</p>
          </div>
          {children}
          <p className="text-center text-sm text-fg-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
