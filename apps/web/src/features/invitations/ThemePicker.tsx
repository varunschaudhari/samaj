import { type InvitationKind, type InvitationTheme, themeFor } from '@samaj/shared';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { Ornament } from './Ornament';
import { THEMES, themesFor, themeVars } from './themes';

/** The card's look, each shown as a small card in its own colours. */
export function ThemePicker({ kind, value, onChange }: { kind: InvitationKind; value: InvitationTheme | null; onChange: (theme: InvitationTheme) => void }) {
  const t = useT();
  const current = themeFor(kind, value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold text-fg">{t('invite.form.theme')}</legend>
      <div role="radiogroup" aria-label={t('invite.form.theme')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {themesFor(kind).map((theme) => {
          const p = THEMES[theme];
          const on = theme === current;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(theme)}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg p-1.5 text-center transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                on ? 'bg-primary-soft ring-2 ring-primary' : 'hover:bg-surface-muted',
              )}
            >
              <span style={themeVars(theme)} className="flex flex-col items-center gap-1.5 rounded-md border-2 border-(--c-frame) bg-(--c-paper) px-2 pt-3 pb-2" aria-hidden="true">
                <span className="text-[0.6rem] font-semibold text-(--c-top)">{t(p.ornament === 'none' || p.ornament === 'lotus' ? 'invite.card.inMemory' : 'invite.card.ganesh')}</span>
                <span className="font-display text-sm font-semibold text-(--c-accent)">{t(`invite.kind.${kind}`)}</span>
                <Ornament kind={p.ornament} className="max-h-3 w-4/5" />
                <span className="mt-1 w-full rounded-sm border border-(--c-panel-line) bg-(--c-panel) py-1 text-[0.6rem] text-(--c-muted)">· · ·</span>
              </span>
              <span className="text-xs font-semibold text-fg">{t(`invite.theme.${theme}`)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
