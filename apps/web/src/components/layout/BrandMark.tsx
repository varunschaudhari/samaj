import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** The Samaj wordmark: a zari ring on peacock green, and the name in Poppins. */
export function BrandMark({ className, onHero = false }: { className?: string; onHero?: boolean }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className={onHero ? 'fill-on-hero' : 'fill-primary'} />
        <circle cx="16" cy="16" r="6" fill="none" strokeWidth="2.5" className="stroke-zari" />
        <circle cx="16" cy="16" r="1.75" className="fill-zari" />
      </svg>
      <span className={cn('font-display text-xl leading-none font-semibold', onHero ? 'text-on-hero' : 'text-fg')}>{t('app.name')}</span>
    </span>
  );
}
