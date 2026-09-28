import { AUDIENCE_GROUPS, type AudienceFamily, type EarlierGuestList, type InvitationAudience, type LinkedFamily, type MemberPage } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Avatar, Button, Checkbox, Icon, Input, Skeleton } from '@/components/ui';
import { History, Search, X } from '@/components/ui/icons';
import { placeLabel } from '@/features/branches/api';
import { formatDate, formatNumber, useLanguageStore, useT } from '@/i18n';
import { api } from '@/lib/api';

/** Families being invited, by where they were picked from. */
export interface GuestPicks {
  tree: Set<string>;
  linked: Set<string>;
  /** From the directory: id to name and place, to show them. */
  picked: Map<string, { headName: string; place: string }>;
}

export const emptyPicks = (): GuestPicks => ({ tree: new Set(), linked: new Set(), picked: new Map() });

/** The ids the API wants, each family once. */
export function picksToInput(p: GuestPicks) {
  const all = new Set([...p.tree, ...p.linked, ...p.picked.keys()]);
  return { guestFamilyIds: [...all], treeFamilyIds: [...p.tree], linkedFamilyIds: [...p.linked].filter((id) => !p.tree.has(id)) };
}

export const pickCount = (p: GuestPicks) => new Set([...p.tree, ...p.linked, ...p.picked.keys()]).size;

function FamilyGroup({ title, families, chosen, onChange, exclude }: { title: string; families: (LinkedFamily & { through?: string | null })[]; chosen: Set<string>; onChange: (next: Set<string>) => void; exclude: Set<string> }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const shown = families.filter((f) => !exclude.has(f.id));
  const allOn = shown.length > 0 && shown.every((f) => chosen.has(f.id));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-fg">{title}</legend>
      {shown.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('invite.form.noneInGroup')}</p>
      ) : (
        <>
          <Checkbox label={t('invite.form.all')} checked={allOn} onChange={() => onChange(allOn ? new Set([...chosen].filter((id) => !shown.some((f) => f.id === id))) : new Set([...chosen, ...shown.map((f) => f.id)]))} />
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {shown.map((f) => (
              <li key={f.id}>
                <Checkbox
                  label={[t('family.title', { name: f.headName }), placeLabel(f.place, f.branch, language), f.through && t('invite.form.maherOf', { name: f.through })].filter(Boolean).join(' · ')}
                  checked={chosen.has(f.id)}
                  onChange={() => toggle(f.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}

/** One tap to invite the families an earlier invitation went to. */
function EarlierLists({ lists, onAdd }: { lists: EarlierGuestList[]; onAdd: (list: EarlierGuestList) => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  if (lists.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-fg">{t('invite.form.earlier')}</legend>
      <p className="text-sm text-fg-muted">{t('invite.form.earlierHint')}</p>
      <ul className="flex flex-col gap-1.5">
        {lists.map((l) => (
          <li key={l.id}>
            <Button variant="secondary" size="sm" leadingIcon={History} className="h-auto w-full justify-start py-2 text-left" onClick={() => onAdd(l)}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">
                  {t(`invite.kind.${l.kind}`)}
                  {l.forNames && `: ${l.forNames}`}
                </span>
                <span className="text-xs font-normal text-fg-muted">
                  {formatDate(l.firstAt, language)} · {t('invite.form.families', { count: formatNumber(l.families.length, language) })}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * Who to invite: the families in the host's tree and their linked families,
 * ticked in groups, and anyone else found in the directory.
 */
export function GuestPicker({
  audience,
  picks,
  onChange,
  ownFamilyId,
  alreadyInvited = new Set(),
  excludeInvitationId,
}: {
  audience: InvitationAudience | undefined;
  picks: GuestPicks;
  onChange: (p: GuestPicks) => void;
  ownFamilyId: string;
  alreadyInvited?: Set<string>;
  /** The invitation being added to: its own list isn't offered. */
  excludeInvitationId?: string;
}) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const found = useQuery({
    queryKey: ['members', 'invite', typed],
    queryFn: async ({ signal }) => (await api.get<MemberPage>('/members', { q: typed, limit: 8 }, signal)).items,
    enabled: typed.length >= 2,
    staleTime: 30_000,
  });
  // One row per family, not the invitee's own or ones already invited or chosen.
  const chosen = new Set([...picks.tree, ...picks.linked, ...picks.picked.keys()]);
  const results = [...new Map((found.data ?? []).filter((m) => m.familyId !== ownFamilyId && !alreadyInvited.has(m.familyId)).map((m) => [m.familyId, m])).values()];
  const count = pickCount(picks);

  // Each family goes where it would be ticked: the tree, linked families, or picked from the directory.
  const addEarlier = (list: EarlierGuestList) => {
    if (!audience) return;
    const inTree = new Set(audience.tree.map((f) => f.id));
    const inLinked = new Set(audience.linked.map((f) => f.id));
    const next = { tree: new Set(picks.tree), linked: new Set(picks.linked), picked: new Map(picks.picked) };
    for (const f of list.families) {
      if (f.id === ownFamilyId || alreadyInvited.has(f.id)) continue;
      if (inTree.has(f.id)) next.tree.add(f.id);
      else if (inLinked.has(f.id)) next.linked.add(f.id);
      else next.picked.set(f.id, { headName: f.headName, place: f.place });
    }
    onChange(next);
  };

  if (!audience) return <Skeleton className="h-40 w-full rounded-md" />;
  return (
    <div className="flex flex-col gap-3">
      <EarlierLists lists={audience.earlier.filter((l) => l.id !== excludeInvitationId)} onAdd={addEarlier} />
      {audience.tree.length === 0 ? (
        <FamilyGroup title={t('invite.form.fromTree')} families={[]} chosen={picks.tree} exclude={alreadyInvited} onChange={(tree) => onChange({ ...picks, tree })} />
      ) : (
        // The tree by how families are related, each with its own "select all".
        AUDIENCE_GROUPS.map((g) => {
          const families = audience.tree.filter((f: AudienceFamily) => f.group === g);
          return families.length ? (
            <FamilyGroup key={g} title={t(`invite.form.group.${g}`)} families={families} chosen={picks.tree} exclude={alreadyInvited} onChange={(tree) => onChange({ ...picks, tree })} />
          ) : null;
        })
      )}
      <FamilyGroup title={t('invite.form.fromLinked')} families={audience.linked} chosen={picks.linked} exclude={alreadyInvited} onChange={(linked) => onChange({ ...picks, linked })} />
      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
        <Input label={t('invite.form.search')} placeholder={t('finder.search')} leadingIcon={Search} autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        {typed.length >= 2 && found.data && (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-fg-muted">{t('tree.noMatch')}</li>
            ) : (
              results.map((m) => (
                <li key={m.familyId}>
                  <button
                    type="button"
                    disabled={chosen.has(m.familyId)}
                    onClick={() => {
                      const picked = new Map(picks.picked);
                      picked.set(m.familyId, { headName: m.familyHead ?? m.name, place: m.place });
                      onChange({ ...picks, picked });
                      setQuery('');
                    }}
                    className="flex min-h-touch w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-muted disabled:opacity-50"
                  >
                    <Avatar name={m.familyHead ?? m.name} size="sm" />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-sm font-semibold text-fg">{t('family.title', { name: m.familyHead ?? m.name })}</span>
                      <span className="truncate text-xs text-fg-muted">
                        {m.name} · {m.place}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        {picks.picked.size > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-fg">{t('invite.form.picked')}</span>
            <ul className="flex flex-wrap gap-2">
              {[...picks.picked].map(([id, f]) => (
                <li key={id} className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pr-1 pl-3 text-sm">
                  {t('family.title', { name: f.headName })}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('invite.form.removeGuest', { name: f.headName })}
                    onClick={() => {
                      const picked = new Map(picks.picked);
                      picked.delete(id);
                      onChange({ ...picks, picked });
                    }}
                  >
                    <Icon icon={X} size="sm" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-fg" aria-live="polite">
        {t('invite.form.count', { count: formatNumber(count, language) })}
        {audience.leftToday < 600 && <span className="font-normal text-fg-muted"> · {t('invite.form.leftToday', { count: formatNumber(audience.leftToday, language) })}</span>}
      </p>
    </div>
  );
}
