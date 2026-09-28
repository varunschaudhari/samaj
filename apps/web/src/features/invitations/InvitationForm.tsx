import { type InvitationDetail, type InvitationInput, type InvitationKind, type InvitationTheme, MAX_INVITATION_FUNCTIONS, invitationInputSchema, themeFor } from '@samaj/shared';
import { Button, Chip, Input, Textarea } from '@/components/ui';
import { Plus, Trash2 } from '@/components/ui/icons';
import { fromLocalInput, toLocalInput } from '@/features/community/events-api';
import { fieldError } from '@/features/auth/form-errors';
import { useT } from '@/i18n';
import { CELEBRATIONS, FUNCTION_NAMES, REMEMBRANCES, isRemembrance } from './kinds';
import { PatrikaDetails } from './PatrikaDetails';
import { TemplatePicker, WordingChips } from './TemplatePicker';
import { ThemePicker } from './ThemePicker';

export interface FunctionDraft {
  id?: string;
  name: string;
  startsLocal: string;
  endsLocal: string;
  venue: string;
  mapUrl: string;
  muhuratLocal: string;
}

export interface InvitationDraft {
  kind: InvitationKind;
  theme: InvitationTheme | null;
  forNames: string;
  message: string;
  functions: FunctionDraft[];
  honorees: { name: string; detail: string }[];
  /** One name per line, as typed. */
  kripa: string;
  blessings: string;
  inviters: string;
  memorialMemberId: string | null;
}

export const emptyFunction = (): FunctionDraft => ({ name: '', startsLocal: '', endsLocal: '', venue: '', mapUrl: '', muhuratLocal: '' });
const lines = (names: string[]) => names.join('\n');
const names = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
/** Occasions whose functions have a शुभमुहूर्त. */
export const HAS_MUHURAT: InvitationKind[] = ['wedding', 'engagement', 'munj', 'housewarming', 'naming'];

export const draftFrom = (inv?: InvitationDetail): InvitationDraft =>
  inv
    ? {
        kind: inv.kind,
        theme: inv.theme,
        forNames: inv.forNames ?? '',
        message: inv.message ?? '',
        functions: inv.functions.map((f) => ({ id: f.id, name: f.name, startsLocal: toLocalInput(f.startsAt), endsLocal: toLocalInput(f.endsAt), venue: f.venue, mapUrl: f.mapUrl ?? '', muhuratLocal: toLocalInput(f.muhuratAt) })),
        honorees: inv.honorees.map((h) => ({ name: h.name, detail: h.detail ?? '' })),
        kripa: lines(inv.kripa),
        blessings: lines(inv.blessings),
        inviters: lines(inv.inviters),
        memorialMemberId: inv.memorial?.memberId ?? null,
      }
    : { kind: 'wedding', theme: null, forNames: '', message: '', functions: [emptyFunction()], honorees: [], kripa: '', blessings: '', inviters: '', memorialMemberId: null };

/** The draft as the API wants it; datetime-local values become ISO times. */
export const draftToInput = (d: InvitationDraft): InvitationInput => ({
  kind: d.kind,
  theme: themeFor(d.kind, d.theme),
  forNames: d.forNames,
  message: d.message,
  functions: d.functions.map((f) => ({
    ...(f.id && { id: f.id }),
    name: f.name,
    startsAt: fromLocalInput(f.startsLocal) ?? '',
    endsAt: fromLocalInput(f.endsLocal),
    venue: f.venue,
    mapUrl: f.mapUrl,
    muhuratAt: HAS_MUHURAT.includes(d.kind) ? fromLocalInput(f.muhuratLocal) : null,
  })),
  honorees: d.honorees.filter((h) => h.name.trim()),
  kripa: isRemembrance(d.kind) ? [] : names(d.kripa),
  blessings: isRemembrance(d.kind) ? [] : names(d.blessings),
  inviters: names(d.inviters),
  memorialMemberId: isRemembrance(d.kind) ? d.memorialMemberId : null,
});

/** Field errors from the shared rules, keyed "functions.0.name". */
export function draftErrors(d: InvitationDraft): Record<string, string> {
  const parsed = invitationInputSchema.safeParse(draftToInput(d));
  if (parsed.success) return {};
  return Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
}

/** The form's parts, shown one per step when creating and all together when editing. */
export type FormSection = 'occasion' | 'functions' | 'patrika';
export const FORM_SECTIONS: FormSection[] = ['occasion', 'functions', 'patrika'];

/** Which part of the form an error belongs to, from its path ("functions.0.name"). */
export const SECTION_OF: Record<string, FormSection> = {
  kind: 'occasion',
  theme: 'occasion',
  forNames: 'occasion',
  functions: 'functions',
  honorees: 'patrika',
  kripa: 'patrika',
  blessings: 'patrika',
  inviters: 'patrika',
  memorialMemberId: 'patrika',
  message: 'patrika',
};
export const sectionErrors = (errors: Record<string, string>, section: FormSection) => Object.keys(errors).filter((path) => SECTION_OF[path.split('.')[0] ?? ''] === section);

/**
 * What the occasion is, whose it is, each function with its time and
 * place, and a message: everything on the card.
 */
export function InvitationForm({
  draft,
  onChange,
  errors,
  sections = FORM_SECTIONS,
}: {
  draft: InvitationDraft;
  onChange: (d: InvitationDraft) => void;
  errors: Record<string, string>;
  sections?: FormSection[];
}) {
  const t = useT();
  const set = (patch: Partial<InvitationDraft>) => onChange({ ...draft, ...patch });
  const setFunction = (i: number, patch: Partial<FunctionDraft>) => set({ functions: draft.functions.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const err = (path: string) => fieldError(t, errors[path]);

  const occasion = (
    <>
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
      <ThemePicker kind={draft.kind} value={draft.theme} onChange={(theme) => set({ theme })} />
      <Input label={t('invite.form.forNames')} labelSuffix={t('common.optional')} hint={t('invite.form.forNamesHint')} value={draft.forNames} onChange={(e) => set({ forNames: e.target.value })} error={err('forNames')} />
    </>
  );

  const functions = (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold text-fg">{t('invite.form.functions')}</legend>
      <p className="-mt-2 text-sm text-fg-muted">{t('invite.form.functionsHint')}</p>
      <TemplatePicker draft={draft} onChange={onChange} />
      {draft.functions.map((f, i) => (
        <div key={f.id ?? i} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 shadow-card">
          <div className="flex items-end gap-2">
            <span className="mb-2.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-zari-soft text-sm font-semibold text-zari-fg tabular-nums" aria-hidden="true">
              {i + 1}
            </span>
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
          {HAS_MUHURAT.includes(draft.kind) && (
            <Input
              type="datetime-local"
              label={t('invite.form.muhurat')}
              labelSuffix={t('common.optional')}
              hint={t('invite.form.muhuratHint')}
              value={f.muhuratLocal}
              onChange={(e) => setFunction(i, { muhuratLocal: e.target.value })}
              error={err(`functions.${i}.muhuratAt`)}
            />
          )}
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
  );

  const patrika = (
    <>
      <PatrikaDetails draft={draft} onChange={onChange} errors={errors} />
      <WordingChips draft={draft} onChange={onChange} />
      <Textarea label={t('invite.form.message')} labelSuffix={t('common.optional')} hint={t('invite.form.messageHint')} rows={3} maxLength={1000} value={draft.message} onChange={(e) => set({ message: e.target.value })} error={err('message')} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {sections.includes('occasion') && occasion}
      {sections.includes('functions') && functions}
      {sections.includes('patrika') && patrika}
    </div>
  );
}
