import type { Language } from '@samaj/shared';
import { formatNumber, formatYear, useLanguageStore, useT } from '@/i18n';

interface Life {
  name: string;
  birthYear: number | null;
  deceased: boolean;
  deathYear: number | null;
}

/** "Late Ramrao Patil" (कै. in Marathi) for someone who has passed away. */
export function useDisplayName() {
  const t = useT();
  return (p: Pick<Life, 'name' | 'deceased'>) => (p.deceased ? t('member.late', { name: p.name }) : p.name);
}

/** "1932–2004", "died 2004", or null when neither year is known. */
export function lifeYears(p: Life, language: Language, diedIn: (year: string) => string): string | null {
  if (!p.deceased) return null;
  const born = p.birthYear ? formatYear(p.birthYear, language) : null;
  const died = p.deathYear ? formatYear(p.deathYear, language) : null;
  if (born && died) return `${born}–${died}`;
  if (died) return diedIn(died);
  return born ? `${born}–` : null;
}

/** Age for the living, years for those who have passed away. */
export function useLifeLabel() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  return (p: Life): string | null => {
    if (p.deceased) return lifeYears(p, language, (year) => t('member.diedIn', { year }));
    const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null;
    return age !== null ? t('family.age', { age: formatNumber(age, language) }) : null;
  };
}
