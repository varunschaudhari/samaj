import { type InvitationDetail, type InvitationInput, type InvitationKind, MAX_INVITATION_FUNCTIONS, invitationInputSchema } from '@samaj/shared';
import { Button, Chip, Input, Textarea } from '@/components/ui';
import { Plus, Trash2 } from '@/components/ui/icons';
import { fromLocalInput, toLocalInput } from '@/features/community/events-api';
import { fieldError } from '@/features/auth/form-errors';
import { useT } from '@/i18n';
import { CELEBRATIONS, FUNCTION_NAMES, REMEMBRANCES } from './kinds';

export interface FunctionDraft {
  id?: string;
  name: string;
  startsLocal: string;
  endsLocal: string;
  venue: string;
  mapUrl: string;
}

export interface InvitationDraft {
  kind: InvitationKind;
  forNames: string;
  message: string;
  functions: FunctionDraft[];
}

export const emptyFunction = (): FunctionDraft => ({ name: '', startsLocal: '', endsLocal: '', venue: '', mapUrl: '' });

export const draftFrom = (inv?: InvitationDetail): InvitationDraft =>
  inv
    ? {
        kind: inv.kind,
        forNames: inv.forNames ?? '',
        message: inv.message ?? '',
        functions: inv.functions.map((f) => ({ id: f.id, name: f.name, startsLocal: toLocalInput(f.startsAt), endsLocal: toLocalInput(f.endsAt), venue: f.venue, mapUrl: f.mapUrl ?? '' })),
      }
    : { kind: 'wedding', forNames: '', message: '', functions: [emptyFunction()] };

/** The draft as the API wants it; datetime-local values become ISO times. */
export const draftToInput = (d: InvitationDraft): InvitationInput => ({
  kind: d.kind,
  forNames: d.forNames,
  message: d.message,
  functions: d.functions.map((f) => ({ ...(f.id && { id: f.id }), name: f.name, startsAt: fromLocalInput(f.startsLocal) ?? '', endsAt: fromLocalInput(f.endsLocal), venue: f.venue, mapUrl: f.mapUrl })),
});

/** Field errors from the shared rules, keyed "functions.0.name". */
export function draftErrors(d: InvitationDraft): Record<string, string> {
  const parsed = invitationInputSchema.safeParse(draftToInput(d));
  if (parsed.success) return {};
  return Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
}

/**
 * What the occasion is, whose it is, each function with its time and
 * place, and a message: everything on the card.
 */
export function InvitationForm({ draft, onChange, errors }: { draft: InvitationDraft; onChange: (d: InvitationDraft) => void; errors: Record<string, string> }) {
  const t = useT();
  const set = (patch: Partial<InvitationDraft>) => onChange({ ...draft, ...patch });
  const setFunction = (i: number, patch: Partial<FunctionDraft>) => set({ functions: draft.functions.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const err = (path: string) => fieldError(t, errors[path]);

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-fg">{t('invite.form.kind')}</legend>
        {[
          ['invite.form.celebrations', CELEBRATIONS],
          ['invite.form.remembrance', REMEMBRANCES],
        ].map(([label, kinds]) => (
          <div key={label as string} className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{t(label as 'invite.form.celebrations')}</span>
            <div className="flex flex-wrap gap-2">
              {(kinds as InvitationKind[]).map((k) => (
                <Chip key={k} selected={draft.kind === k} onClick={() => set({ kind: k })} className="px-3">
                  {t(`invite.kind.${k}`)}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <Input label={t('invite.form.forNames')} labelSuffix={t('common.optional')} hint={t('invite.form.forNamesHint')} value={draft.forNames} onChange={(e) => set({ forNames: e.target.value })} error={err('forNames')} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-fg">{t('invite.form.functions')}</legend>
        <p className="-mt-2 text-sm text-fg-muted">{t('invite.form.functionsHint')}</p>
        {draft.functions.map((f, i) => (
          <div key={f.id ?? i} className="flex flex-col gap-3 rounded-md border border-line p-3">
            <div className="flex items-end gap-2">
              <Input label={t('invite.form.functionName')} value={f.name} onChange={(e) => setFunction(i, { name: e.target.value })} error={err(`functions.${i}.name`)} fieldClassName="flex-1" />
              {draft.functions.length > 1 && (
                <Button variant="ghost" size="sm" leadingIcon={Trash2} aria-label={t('invite.form.removeFunction')} onClick={() => set({ functions: draft.functions.filter((_, j) => j !== i) })} />
              )}
            </div>
            {FUNCTION_NAMES[draft.kind].length > 0 && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {FUNCTION_NAMES[draft.kind].map((name) => (
                  <Chip key={name} selected={f.name === name} onClick={() => setFunction(i, { name })} className="min-h-9 px-3 text-xs">
                    {name}
                  </Chip>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="datetime-local" label={t('invite.form.starts')} value={f.startsLocal} onChange={(e) => setFunction(i, { startsLocal: e.target.value })} error={err(`functions.${i}.startsAt`)} />
              <Input type="datetime-local" label={t('invite.form.ends')} labelSuffix={t('common.optional')} value={f.endsLocal} onChange={(e) => setFunction(i, { endsLocal: e.target.value })} error={err(`functions.${i}.endsAt`)} />
            </div>
            <Input label={t('invite.form.venue')} value={f.venue} onChange={(e) => setFunction(i, { venue: e.target.value })} error={err(`functions.${i}.venue`)} />
            <Input label={t('invite.form.mapUrl')} labelSuffix={t('common.optional')} inputMode="url" value={f.mapUrl} onChange={(e) => setFunction(i, { mapUrl: e.target.value })} error={err(`functions.${i}.mapUrl`)} />
          </div>
        ))}
        {errors.functions && <p className="text-sm text-danger">{err('functions')}</p>}
        {draft.functions.length < MAX_INVITATION_FUNCTIONS && (
          <Button variant="secondary" size="sm" leadingIcon={Plus} className="self-start" onClick={() => set({ functions: [...draft.functions, { ...emptyFunction(), venue: draft.functions.at(-1)?.venue ?? '' }] })}>
            {t('invite.form.addFunction')}
          </Button>
        )}
      </fieldset>

      <Textarea label={t('invite.form.message')} labelSuffix={t('common.optional')} hint={t('invite.form.messageHint')} rows={3} maxLength={1000} value={draft.message} onChange={(e) => set({ message: e.target.value })} error={err('message')} />
    </div>
  );
}
