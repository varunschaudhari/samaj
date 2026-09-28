import { useState } from 'react';
import { Avatar, Button, Input, Modal, Skeleton, Textarea } from '@/components/ui';
import { Network, Plus, Search, Trash2 } from '@/components/ui/icons';
import { useMe } from '@/features/auth/api';
import { fieldError } from '@/features/auth/form-errors';
import { useFamilyTree } from '@/features/families/tree-api';
import { findPeople } from '@/features/families/tree-layout';
import { formatYear, useLanguageStore, useT } from '@/i18n';
import type { InvitationDraft } from './InvitationForm';
import { isRemembrance } from './kinds';
import { type Person, fillFromTree, titled, treePeople } from './patrikaFromTree';

/** Pick whose occasion it is from the family tree; the patrika's names follow from their place in it. */
function TreePicker({ open, onClose, remembrance, onPick }: { open: boolean; onClose: () => void; remembrance: boolean; onPick: (ego: Person, people: Person[]) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const me = useMe();
  const tree = useFamilyTree(me.data?.familyId ?? '', open);
  const [query, setQuery] = useState('');
  const people = tree.data ? treePeople(tree.data) : [];
  // Remembrance: those who have passed away; otherwise the living.
  const eligible = people.filter((p) => p.deceased === remembrance);
  const shown = query.trim() ? findPeople(eligible, query) : eligible;

  return (
    <Modal open={open} onClose={onClose} title={t(remembrance ? 'invite.tree.pickRemembered' : 'invite.tree.pick')}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">{t(remembrance ? 'invite.tree.pickRememberedHint' : 'invite.tree.pickHint')}</p>
        <Input label={t('finder.search')} hideLabel placeholder={t('finder.search')} leadingIcon={Search} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        {tree.isPending ? (
          <Skeleton className="h-48 w-full rounded-md" />
        ) : shown.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('tree.noMatch')}</p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p, people);
                    onClose();
                  }}
                  className="flex min-h-touch w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted"
                >
                  <Avatar name={p.name} src={p.photoUrl} size="sm" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-fg">{p.deceased ? titled(p, language) : p.name}</span>
                    <span className="truncate text-xs text-fg-muted">
                      {[p.place, p.birthYear && formatYear(p.birthYear, language)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/**
 * What a printed patrika carries besides the functions: whose occasion it is
 * with their parents and village, the elders invoked and blessing, and who
 * invites. Filled from the family tree in one tap, and all editable.
 */
export function PatrikaDetails({ draft, onChange, errors }: { draft: InvitationDraft; onChange: (d: InvitationDraft) => void; errors: Record<string, string> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [picking, setPicking] = useState(false);
  const quiet = isRemembrance(draft.kind);
  const set = (patch: Partial<InvitationDraft>) => onChange({ ...draft, ...patch });
  const setHonoree = (i: number, patch: Partial<InvitationDraft['honorees'][number]>) => set({ honorees: draft.honorees.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const err = (path: string) => fieldError(t, errors[path]);

  const [lastFill, setLastFill] = useState<string | null>(null);
  const pick = (ego: Person, people: Person[]) => {
    const fill = fillFromTree(ego, people, draft.kind, language, { son: t('invite.tree.son'), daughter: t('invite.tree.daughter'), and: t('invite.tree.and') });
    // The other side of a wedding is usually another family: keep what was typed for them.
    const others = quiet ? [] : draft.honorees.slice(1);
    onChange({
      ...draft,
      // Replace what an earlier pick filled in; keep what the family typed themselves.
      forNames: !draft.forNames || draft.forNames === lastFill ? fill.forNames : draft.forNames,
      honorees: [{ name: fill.honoree.name, detail: fill.honoree.detail ?? '' }, ...others],
      kripa: fill.kripa.join('\n') || draft.kripa,
      blessings: fill.blessings.join('\n') || draft.blessings,
      inviters: fill.inviters.join('\n') || draft.inviters,
      memorialMemberId: fill.memorialMemberId,
    });
    setLastFill(fill.forNames);
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-fg">
        {t('invite.form.patrika')} <span className="font-normal text-fg-muted">({t('common.optional')})</span>
      </legend>
      <p className="text-sm text-fg-muted">{t(quiet ? 'invite.form.patrikaHintRemembrance' : 'invite.form.patrikaHint')}</p>
      <Button variant="secondary" size="sm" leadingIcon={Network} className="self-start" onClick={() => setPicking(true)}>
        {t('invite.tree.fill')}
      </Button>

      {draft.honorees.map((h, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
          <div className="flex items-end gap-2">
            <Input label={t(quiet ? 'invite.form.remembered' : 'invite.form.honoree')} value={h.name} onChange={(e) => setHonoree(i, { name: e.target.value })} error={err(`honorees.${i}.name`)} fieldClassName="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={Trash2}
              aria-label={t('invite.form.removeHonoree')}
              onClick={() => set({ honorees: draft.honorees.filter((_, j) => j !== i), ...(i === 0 && { memorialMemberId: null }) })}
            />
          </div>
          <Input label={t('invite.form.honoreeDetail')} labelSuffix={t('common.optional')} hint={i === 0 && !quiet ? t('invite.form.honoreeDetailHint') : undefined} value={h.detail} onChange={(e) => setHonoree(i, { detail: e.target.value })} error={err(`honorees.${i}.detail`)} />
        </div>
      ))}
      {draft.honorees.length < (quiet ? 1 : 2) && (
        <Button variant="ghost" size="sm" leadingIcon={Plus} className="self-start" onClick={() => set({ honorees: [...draft.honorees, { name: '', detail: '' }] })}>
          {t(draft.honorees.length === 0 ? 'invite.form.addHonoree' : 'invite.form.addOtherSide')}
        </Button>
      )}

      {!quiet && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Textarea label={t('invite.form.kripa')} hint={t('invite.form.oneEachLine')} rows={3} value={draft.kripa} onChange={(e) => set({ kripa: e.target.value })} error={err('kripa')} />
          <Textarea label={t('invite.form.blessings')} hint={t('invite.form.oneEachLine')} rows={3} value={draft.blessings} onChange={(e) => set({ blessings: e.target.value })} error={err('blessings')} />
        </div>
      )}
      <Textarea label={t(quiet ? 'invite.form.grieving' : 'invite.form.inviters')} hint={t('invite.form.oneEachLine')} rows={3} value={draft.inviters} onChange={(e) => set({ inviters: e.target.value })} error={err('inviters')} />

      <TreePicker open={picking} onClose={() => setPicking(false)} remembrance={quiet} onPick={pick} />
    </fieldset>
  );
}
