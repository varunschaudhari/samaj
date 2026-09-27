import { type Gender, type Relation, birthYearSchema } from '@samaj/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, toast } from '@/components/ui';
import { FormAlert } from '@/features/auth/FormAlert';
import { formatNumber, useErrorMessage, useLanguageStore, useT } from '@/i18n';
import { useSaveMember } from './api';

export type ElderPair = 'grandparents' | 'greatGrandparents';

const PAIRS: Record<ElderPair, { relation: Relation; gender: Gender }[]> = {
  grandparents: [
    { relation: 'grandfather', gender: 'male' },
    { relation: 'grandmother', gender: 'female' },
  ],
  greatGrandparents: [
    { relation: 'greatGrandfather', gender: 'male' },
    { relation: 'greatGrandmother', gender: 'female' },
  ],
};

interface Row {
  name: string;
  deceased: boolean;
  birthYear: string;
  deathYear: string;
}
const EMPTY: Row = { name: '', deceased: false, birthYear: '', deathYear: '' };

const validYear = (v: string) => birthYearSchema.safeParse(v).success;

/**
 * Both grandparents (or great-grandparents) in one go, living or not. A blank
 * name is skipped. Consent is asked only when a living person is added.
 */
export function EldersModal({ familyId, pair, onClose }: { familyId: string; pair: ElderPair | null; onClose: () => void }) {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const errorMessage = useErrorMessage();
  const save = useSaveMember(familyId);
  const [rows, setRows] = useState<Row[]>([EMPTY, EMPTY]);
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pair) {
      setRows([EMPTY, EMPTY]);
      setConsent(false);
      setProblem(null);
    }
  }, [pair]);

  if (!pair) return <Modal open={false} onClose={onClose} title="" />;
  const people = PAIRS[pair];
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const filled = rows.map((r, i) => ({ ...r, ...people[i]! })).filter((r) => r.name.trim().length > 0);
  const needsConsent = filled.some((r) => !r.deceased);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (filled.length === 0) return setProblem(t('elders.nothing'));
    if (filled.some((r) => (r.birthYear && !validYear(r.birthYear)) || (r.deceased && r.deathYear && !validYear(r.deathYear)))) return setProblem(t('validation.birthYear'));
    if (needsConsent && !consent) return setProblem(t('validation.consentRequired'));
    setProblem(null);
    setSaving(true);
    let added = 0;
    try {
      for (const r of filled) {
        await save.mutateAsync({
          memberId: null,
          input: {
            name: r.name.trim(),
            relation: r.relation,
            gender: r.gender,
            birthYear: r.birthYear,
            deceased: r.deceased,
            deathYear: r.deceased ? r.deathYear : '',
            occupation: '',
            education: '',
            phone: '',
            ...(!r.deceased && { consent: true as const }),
          },
        });
        added++;
      }
      toast.success(t('elders.added', { count: formatNumber(added, language) }));
      onClose();
    } catch (err) {
      // Whoever was saved before the error stays; say what went wrong for the rest.
      setProblem(errorMessage(err));
      const saved = new Set(filled.slice(0, added).map((f) => f.relation));
      setRows((r) => r.map((row, i) => (saved.has(people[i]?.relation as Relation) ? EMPTY : row)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(pair === 'grandparents' ? 'elders.addGrand' : 'elders.addGreat')}
      description={t('elders.hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="elders-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="elders-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {problem && <FormAlert message={problem} />}
        {people.map((p, i) => {
          const row = rows[i] ?? EMPTY;
          return (
            <fieldset key={p.relation} className="flex flex-col gap-3 rounded-md border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-fg">{t(`relation.${p.relation}`)}</legend>
              <Input label={t('member.name')} autoComplete="off" value={row.name} onChange={(e) => set(i, { name: e.target.value })} />
              <Checkbox label={t('member.deceased')} checked={row.deceased} onChange={(e) => set(i, { deceased: e.target.checked })} />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('member.birthYear')}
                  labelSuffix={t('common.optional')}
                  inputMode="numeric"
                  maxLength={4}
                  value={row.birthYear}
                  onChange={(e) => set(i, { birthYear: e.target.value })}
                />
                {row.deceased && (
                  <Input
                    label={t('member.deathYear')}
                    labelSuffix={t('common.optional')}
                    inputMode="numeric"
                    maxLength={4}
                    value={row.deathYear}
                    onChange={(e) => set(i, { deathYear: e.target.value })}
                  />
                )}
              </div>
            </fieldset>
          );
        })}
        {needsConsent && <Checkbox label={t('privacy.consentMember')} checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
      </form>
    </Modal>
  );
}
