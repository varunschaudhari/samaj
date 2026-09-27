import type { LinkedFamily, MemberPage } from '@samaj/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { Search } from '@/components/ui/icons';
import { useT } from '@/i18n';
import { api } from '@/lib/api';

/**
 * For someone adopted: the family they were born into, found in the
 * directory by the name of anyone in it. Only the family and its committee
 * see it; matrimony keeps matches away from that family's gotra too.
 */
export function BirthFamilyField({
  value,
  known,
  exclude,
  onChange,
  error,
}: {
  value: string;
  /** The birth family already saved, to name it without a search. */
  known?: LinkedFamily;
  /** Their own family, which can't be their birth family. */
  exclude: string;
  onChange: (familyId: string) => void;
  error?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; head: string } | null>(null);
  const typed = query.trim();
  const found = useQuery({
    queryKey: ['members', 'birthFamily', typed],
    queryFn: async ({ signal }) => (await api.get<MemberPage>('/members', { q: typed, limit: 8 }, signal)).items,
    enabled: typed.length >= 2,
    staleTime: 30_000,
  });
  // One entry per family.
  const families = [...new Map((found.data ?? []).filter((m) => m.familyId !== exclude).map((m) => [m.familyId, m])).values()];
  const head = value && (picked?.id === value ? picked.head : known?.id === value ? known.headName : null);

  if (value && head) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line p-3">
        <span className="flex-1 text-sm">
          <span className="block text-xs font-semibold text-fg-muted">{t('member.birthFamily')}</span>
          {t('family.title', { name: head })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange('')}>
          {t('member.birthFamilyClear')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Input
        label={t('member.birthFamily')}
        labelSuffix={t('common.optional')}
        hint={t('member.birthFamilyHint')}
        leadingIcon={Search}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        error={error}
      />
      {typed.length >= 2 && !found.isPending && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {families.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">{t('member.birthFamilyNone')}</li>
          ) : (
            families.map((m) => (
              <li key={m.familyId}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked({ id: m.familyId, head: m.familyHead ?? m.name });
                    onChange(m.familyId);
                    setQuery('');
                  }}
                  className="flex min-h-touch w-full flex-col px-3 py-1.5 text-left hover:bg-surface-muted"
                >
                  <span className="text-sm font-semibold text-fg">{t('family.title', { name: m.familyHead ?? m.name })}</span>
                  <span className="text-xs text-fg-muted">
                    {m.name} · {m.place}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
