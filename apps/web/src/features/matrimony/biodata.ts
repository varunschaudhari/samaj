import { type Language, type ProfileDetail, gotraName, nakshatraName, rashiName } from '@samaj/shared';
import type { AppIcon } from '@/components/ui/icons';
import { Briefcase, CalendarDays, House, UserRound } from '@/components/ui/icons';
import { type MessageKey, formatNumber } from '@/i18n';
import { branchName } from '@/features/branches/api';
import { formatBirthDate, formatBirthTime, formatFeet, formatHeight } from './api';

type T = (key: MessageKey, values?: Record<string, string | number>) => string;

export interface BiodataRow {
  label: string;
  value: string;
}

export interface BiodataSection {
  id: 'personal' | 'horoscope' | 'career' | 'family';
  title: string;
  icon: AppIcon;
  rows: BiodataRow[];
}

const row = (label: string, value: string | null | undefined): BiodataRow[] => (value ? [{ label, value }] : []);

function siblingText(t: T, language: Language, count: number | null, married: number | null): string | null {
  if (count === null) return null;
  if (count === 0) return t('matrimony.siblingsNone');
  if (!married) return formatNumber(count, language);
  return t('matrimony.siblingsCount', { count: formatNumber(count, language), married: formatNumber(married, language) });
}

/**
 * The profile as biodata sections, the way families read one: personal
 * details, birth and horoscope, education and work, family. Empty rows and
 * empty sections are left out.
 */
export function biodataSections(p: ProfileDetail, t: T, language: Language): BiodataSection[] {
  const sections: BiodataSection[] = [
    {
      id: 'personal',
      title: t('matrimony.section.personal'),
      icon: UserRound,
      rows: [
        ...row(t('matrimony.age'), p.age !== null ? t('matrimony.years', { age: formatNumber(p.age, language) }) : null),
        ...row(t('matrimony.height'), p.heightCm ? formatHeight(p.heightCm) : null),
        ...row(t('matrimony.maritalStatus'), p.maritalStatus ? t(`matrimony.marital.${p.maritalStatus}`) : null),
        ...row(t('matrimony.diet'), p.diet ? t(`matrimony.diet.${p.diet}`) : null),
        ...row(t('family.gotra'), gotraName(p.gotra, language)),
      ],
    },
    {
      id: 'horoscope',
      title: t('matrimony.section.horoscope'),
      icon: CalendarDays,
      rows: [
        ...row(t('matrimony.birthDate'), p.birthDate ? formatBirthDate(p.birthDate, language) : null),
        ...row(t('matrimony.birthTime'), p.birthTime ? formatBirthTime(p.birthTime, language) : null),
        ...row(t('matrimony.birthPlace'), p.birthPlace),
        ...row(t('matrimony.rashi'), rashiName(p.rashi, language)),
        ...row(t('matrimony.nakshatra'), nakshatraName(p.nakshatra, language)),
        ...row(t('matrimony.manglik'), p.manglik ? t(`matrimony.manglik.${p.manglik}`) : null),
        ...row(t('matrimony.maternalGotra'), gotraName(p.maternalGotra, language)),
      ],
    },
    {
      id: 'career',
      title: t('matrimony.section.career'),
      icon: Briefcase,
      rows: [
        ...row(t('member.education'), p.education),
        ...row(t('member.occupation'), p.occupation),
        ...row(t('matrimony.workLocation'), p.workLocation),
        ...row(t('matrimony.income'), p.income ? t(`matrimony.income.${p.income}`) : null),
      ],
    },
    {
      id: 'family',
      title: t('matrimony.section.family'),
      icon: House,
      rows: [
        ...row(t('matrimony.fatherOccupation'), p.fatherOccupation),
        ...row(t('matrimony.motherOccupation'), p.motherOccupation),
        ...row(t('matrimony.brothers'), siblingText(t, language, p.siblings.brothers, p.siblings.brothersMarried)),
        ...row(t('matrimony.sisters'), siblingText(t, language, p.siblings.sisters, p.siblings.sistersMarried)),
        ...row(t('matrimony.nativePlace'), p.nativePlace),
      ],
    },
  ];
  return sections.filter((s) => s.rows.length > 0);
}

/** "Age 22–27", "5′2″ or taller", "Never married", "Jalgaon District": the family's preferences as short chips. */
export function preferenceChips(p: ProfileDetail, t: T, language: Language): string[] {
  const { ageMin, ageMax, heightMinCm, maritalStatuses, diets, branches } = p.preferences;
  const chips: string[] = [];
  if (ageMin !== null && ageMax !== null) chips.push(t('matrimony.pref.ageRange', { min: formatNumber(ageMin, language), max: formatNumber(ageMax, language) }));
  else if (ageMin !== null) chips.push(t('matrimony.pref.ageFrom', { min: formatNumber(ageMin, language) }));
  else if (ageMax !== null) chips.push(t('matrimony.pref.ageTo', { max: formatNumber(ageMax, language) }));
  if (heightMinCm !== null) chips.push(t('matrimony.pref.heightFrom', { height: formatFeet(heightMinCm) }));
  for (const m of maritalStatuses) chips.push(t(`matrimony.marital.${m}`));
  for (const d of diets) chips.push(t(`matrimony.diet.${d}`));
  for (const b of branches) chips.push(branchName(b, language));
  return chips;
}

/** Headline facts under the name: "27 yrs · 5′7″ · Never married". */
export function headlineFacts(p: Pick<ProfileDetail, 'age' | 'heightCm' | 'maritalStatus'>, t: T, language: Language): string[] {
  return [
    p.age !== null ? t('matrimony.years', { age: formatNumber(p.age, language) }) : null,
    p.heightCm ? formatFeet(p.heightCm) : null,
    p.maritalStatus ? t(`matrimony.marital.${p.maritalStatus}`) : null,
  ].filter((f): f is string => Boolean(f));
}
