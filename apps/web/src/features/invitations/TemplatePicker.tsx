import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { Sparkles } from '@/components/ui/icons';
import { useLanguageStore, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import type { InvitationDraft } from './InvitationForm';
import { templateFunctions, templatesFor, wordingsFor } from './templates';

/** Start from the functions an occasion usually has, timed around one main day. */
export function TemplatePicker({ draft, onChange }: { draft: InvitationDraft; onChange: (d: InvitationDraft) => void }) {
  const t = useT();
  const templates = templatesFor(draft.kind);
  const [chosen, setChosen] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const tpl = templates.find((x) => x.id === chosen) ?? templates[0];
  if (!tpl) return null;
  // Replacing functions the family already filled in needs saying.
  const filled = draft.functions.some((f) => f.name.trim() || f.startsLocal || f.venue.trim());
  const venue = draft.functions.find((f) => f.venue.trim())?.venue ?? '';

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-primary/50 bg-primary-soft/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Sparkles className="size-4 text-primary" weight="duotone" />
        {t('invite.template.title')}
      </div>
      {templates.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('invite.template.title')}>
          {templates.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === tpl.id}
              onClick={() => setChosen(x.id)}
              className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', x.id === tpl.id ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-fg')}
            >
              {t(`invite.template.${x.id}`)}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-fg-muted">{tpl.functions.map((f) => f.name).join(' · ')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" label={t('invite.template.mainDay')} value={day} onChange={(e) => setDay(e.target.value)} fieldClassName="w-48" />
        <Button
          variant="secondary"
          size="sm"
          disabled={!day}
          onClick={() =>
            onChange({ ...draft, functions: templateFunctions(tpl, day).map((f) => ({ ...f, venue, mapUrl: '', muhuratLocal: '' })) })
          }
        >
          {t('invite.template.apply')}
        </Button>
      </div>
      {filled && <p className="text-xs text-fg-muted">{t('invite.template.replaces')}</p>}
    </div>
  );
}

/** Traditional lines for the message, one tap to use. */
export function WordingChips({ draft, onChange }: { draft: InvitationDraft; onChange: (d: InvitationDraft) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const lines = wordingsFor(draft.kind);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t('invite.form.wordings')}</span>
      <ul className="flex flex-col gap-1.5">
        {lines.map((w) => {
          const text = w.text[language];
          const on = draft.message.trim() === text;
          return (
            <li key={w.text.en}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...draft, message: text })}
                className={cn('w-full rounded-md border px-3 py-2 text-left text-sm', on ? 'border-primary bg-primary-soft text-fg' : 'border-line bg-surface text-fg hover:border-line-strong')}
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
