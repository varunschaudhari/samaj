import { LANGUAGES } from '@samaj/shared';
import { useChangeLanguage } from '@/features/auth/api';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** English / मराठी segmented switch. Each option is labelled in its own language. */
export function LanguageSwitch({ className, onHero = false }: { className?: string; onHero?: boolean }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const { change } = useChangeLanguage();

  return (
    <div role="group" aria-label={t('language.label')} className={cn('inline-flex rounded-full border p-0.5', onHero ? 'border-on-hero-muted/60' : 'border-line-strong', className)}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={language === code}
          onClick={() => change(code)}
          className={cn(
            'min-h-10 min-w-16 rounded-full px-3 text-sm font-semibold transition-colors duration-150',
            // The 40px pill sits inside a 44px group, so the touch target is still 44px.
            language === code
              ? onHero
                ? 'bg-on-hero text-primary'
                : 'bg-primary text-on-primary'
              : onHero
                ? 'text-on-hero-muted hover:text-on-hero'
                : 'text-fg-muted hover:text-fg',
          )}
        >
          {t(`language.${code}`)}
        </button>
      ))}
    </div>
  );
}
