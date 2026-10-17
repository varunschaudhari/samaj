import { type Language, type MissingField, type ProfileDetail, formatPhone, gotraName, nakshatraName, rashiName } from '@samaj/shared';
import type { AppIcon } from '@/components/ui/icons';
import { Briefcase, CalendarDays, GraduationCap, House, MapPin, Rows, UserRound, Utensils, UsersRound } from '@/components/ui/icons';
import { type MessageKey, formatNumber } from '@/i18n';
import { branchName } from '@/features/branches/api';
import { formatBirthDate, formatBirthTime, formatFeet, formatHeight } from './api';

type T = (key: MessageKey, values?: Record<string, string | number>) => string;

export interface BiodataRow {
  label: string;
  value: string;
}

export interface BiodataSection {
  id: 'personal' | 'horoscope' | 'career' | 'family' | 'mama' | 'contact';
  title: string;
  icon: AppIcon;
  rows: BiodataRow[];
}

const row = (label: string, value: string | null | undefined): BiodataRow[] => (value ? [{ label, value }] : []);
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ') || null;

function siblingText(t: T, language: Language, count: number | null, married: number | null): string | null {
  if (count === null) return null;
  if (count === 0) return t('matrimony.siblingsNone');
  if (!married) return formatNumber(count, language);
  return t('matrimony.siblingsCount', { count: formatNumber(count, language), married: formatNumber(married, language) });
}

/** "₹45,000 a month", in the reader's digits. */
export function formatRupees(amount: number, language: Language): string {
  return `₹${formatNumber(amount, language)}`;
}

/** The income line: the exact amount for the family and committee, the band for others, or nothing. */
function incomeText(p: ProfileDetail, t: T, language: Language): string | null {
  if (p.monthlyIncome !== undefined && p.monthlyIncome !== null) return t('matrimony.incomeMonthly', { amount: formatRupees(p.monthlyIncome, language) });
  return p.incomeBand ? t(`matrimony.incomeBand.${p.incomeBand}`) : null;
}

/** Surname, given name and father's name, the order the samaj form uses. */
export function formalName(p: Pick<ProfileDetail, 'surname' | 'firstName' | 'fatherName'>): string | null {
  return [p.surname, p.firstName, p.fatherName].filter(Boolean).join(' ') || null;
}

/**
 * The profile as biodata sections, in the order of the samaj's vadhu-var
 * form: personal, birth, education and work, parents and family, maternal
 * uncle, and (for those allowed) address and contact. Empty rows and empty
 * sections are left out.
 */
export function biodataSections(p: ProfileDetail, t: T, language: Language): BiodataSection[] {
  const time = [p.birthTimeOfDay ? t(`matrimony.timeOfDay.${p.birthTimeOfDay}`) : null, p.birthTime ? formatBirthTime(p.birthTime, language) : null].filter(Boolean).join(' · ');
  const sections: BiodataSection[] = [
    {
      id: 'personal',
      title: t('matrimony.section.personal'),
      icon: UserRound,
      rows: [
        ...row(t('matrimony.formalName'), formalName(p)),
        ...row(t('matrimony.age'), p.age !== null ? t('matrimony.years', { age: formatNumber(p.age, language) }) : null),
        ...row(t('matrimony.height'), p.heightCm ? formatHeight(p.heightCm) : null),
        ...row(t('matrimony.maritalStatus'), p.maritalStatus ? t(`matrimony.marital.${p.maritalStatus}`) : null),
        ...row(t('matrimony.diet'), p.diet ? t(`matrimony.diet.${p.diet}`) : null),
        ...row(t('matrimony.kul'), gotraName(p.gotra, language)),
        ...row(t('matrimony.disability'), p.hasDisability ? (p.disabilityDetail ?? t('matrimony.yes')) : null),
      ],
    },
    {
      id: 'horoscope',
      title: t('matrimony.section.horoscope'),
      icon: CalendarDays,
      rows: [
        ...row(t('matrimony.birthDate'), p.birthDate ? formatBirthDate(p.birthDate, language) : null),
        ...row(t('matrimony.birthTime'), time),
        ...row(t('matrimony.birthPlace'), p.birthPlace),
        ...row(t('matrimony.rashi'), rashiName(p.rashi, language)),
        ...row(t('matrimony.nakshatra'), nakshatraName(p.nakshatra, language)),
        ...row(t('matrimony.manglik'), p.manglik ? t(`matrimony.manglik.${p.manglik}`) : null),
      ],
    },
    {
      id: 'career',
      title: t('matrimony.section.career'),
      icon: Briefcase,
      rows: [
        ...row(t('matrimony.educationLevel'), p.educationLevel ? t(`matrimony.educationLevel.${p.educationLevel}`) : null),
        ...row(t('matrimony.degree'), p.education),
        ...row(t('matrimony.otherEducation'), p.otherEducation),
        ...row(t('member.occupation'), p.occupation),
        ...row(t('matrimony.employerType'), p.employerType ? t(`matrimony.employerType.${p.employerType}`) : null),
        ...row(t('matrimony.employerName'), p.employerName),
        ...row(t('matrimony.designation'), p.designation),
        ...row(t('matrimony.workLocation'), p.workLocation),
        ...row(t('matrimony.monthlyIncome'), incomeText(p, t, language)),
      ],
    },
    {
      id: 'family',
      title: t('matrimony.section.family'),
      icon: House,
      rows: [
        ...row(t('matrimony.parentName'), p.parentName),
        ...row(t('matrimony.parentOccupation'), p.parentOccupation),
        ...row(t('matrimony.parentWorkVillage'), p.parentWorkVillage),
        ...row(t('matrimony.motherOccupation'), p.motherOccupation),
        ...row(t('matrimony.brothers'), siblingText(t, language, p.siblings.brothers, p.siblings.brothersMarried)),
        ...row(t('matrimony.sisters'), siblingText(t, language, p.siblings.sisters, p.siblings.sistersMarried)),
        ...row(t('matrimony.nativeVillage'), join(p.nativeVillage, p.nativeDistrict)),
      ],
    },
    {
      id: 'mama',
      title: t('matrimony.section.mama'),
      icon: UsersRound,
      rows: [
        ...row(t('matrimony.mamaName'), p.mamaName),
        ...row(t('matrimony.mamaKul'), gotraName(p.mamaKul, language)),
        ...row(t('matrimony.mamaVillage'), p.mamaVillage),
        ...row(t('matrimony.mamaNativeVillage'), join(p.mamaNativeVillage, p.mamaNativeDistrict)),
        ...row(t('matrimony.mamaMobile'), p.contact?.mamaMobile ? formatPhone(p.contact.mamaMobile) : null),
      ],
    },
  ];
  if (p.contact) {
    const a = p.contact.address;
    sections.push({
      id: 'contact',
      title: t('matrimony.section.contact'),
      icon: House,
      rows: [
        ...row(t('matrimony.addressLine'), a.line),
        ...row(t('matrimony.village'), join(a.village, a.taluka ? t('matrimony.talukaOf', { taluka: a.taluka }) : null)),
        ...row(t('matrimony.district'), join(a.district, a.pincode)),
        ...row(t('matrimony.contactPerson'), `${p.contact.name} · ${formatPhone(p.contact.phone)}`),
        ...row(t('matrimony.candidateMobile'), p.contact.candidateMobile ? formatPhone(p.contact.candidateMobile) : null),
        ...row(t('matrimony.parentWhatsapp'), p.contact.parentWhatsapp ? formatPhone(p.contact.parentWhatsapp) : null),
        ...row(t('matrimony.employerAddress'), p.contact.employerAddress),
      ],
    });
  }
  return sections.filter((s) => s.rows.length > 0);
}

/**
 * The facts families look for first, in plain words, for the top of a
 * profile: who, how old and tall, what they studied and do, kul and mama's
 * kul, where from.
 */
export function glanceRows(p: ProfileDetail, t: T, language: Language): BiodataRow[] {
  const education = [p.educationLevel ? t(`matrimony.educationLevel.${p.educationLevel}`) : null, p.education, p.otherEducation].filter(Boolean).join(' · ');
  const work = [p.occupation, p.designation, p.employerName, p.employerType ? t(`matrimony.employerType.${p.employerType}`) : null, p.workLocation].filter(Boolean).join(' · ');
  return [
    ...row(t('matrimony.formalName'), formalName(p)),
    ...row(t('matrimony.age'), p.age !== null ? t('matrimony.years', { age: formatNumber(p.age, language) }) : null),
    ...row(t('matrimony.height'), p.heightCm ? formatHeight(p.heightCm) : null),
    ...row(t('matrimony.maritalStatus'), p.maritalStatus ? t(`matrimony.marital.${p.maritalStatus}`) : null),
    ...row(t('member.education'), education),
    ...row(t('matrimony.glance.work'), work),
    ...row(t('matrimony.monthlyIncome'), incomeText(p, t, language)),
    ...row(t('matrimony.kul'), gotraName(p.gotra, language)),
    ...row(t('matrimony.mamaKul'), gotraName(p.mamaKul, language)),
    ...row(t('matrimony.nativeVillage'), join(p.nativeVillage, p.nativeDistrict)),
    ...row(t('matrimony.manglik'), p.manglik ? t(`matrimony.manglik.${p.manglik}`) : null),
    ...row(t('matrimony.diet'), p.diet ? t(`matrimony.diet.${p.diet}`) : null),
    ...row(t('matrimony.disability'), p.hasDisability ? (p.disabilityDetail ?? t('matrimony.yes')) : null),
  ];
}

/** The rest, folded into three: birth and horoscope, family with the mama, and (when allowed) address and contact. */
export function foldedSections(p: ProfileDetail, t: T, language: Language): BiodataSection[] {
  const all = biodataSections(p, t, language);
  const byId = (id: BiodataSection['id']) => all.find((s) => s.id === id);
  const family = byId('family');
  const mama = byId('mama');
  const merged: BiodataSection[] = [];
  const horoscope = byId('horoscope');
  if (horoscope) merged.push(horoscope);
  const familyRows = [...(family?.rows ?? []).filter((r) => r.label !== t('matrimony.nativeVillage')), ...(mama?.rows ?? []).filter((r) => r.label !== t('matrimony.mamaKul'))];
  if (familyRows.length) merged.push({ id: 'family', title: t('matrimony.section.familyAndMama'), icon: family?.icon ?? House, rows: familyRows });
  const contact = byId('contact');
  if (contact) merged.push(contact);
  return merged;
}

/** Bumble-style chips under the photo: height, education, work, city, diet, kul. */
export function profileChips(p: ProfileDetail, t: T, language: Language): { icon: AppIcon; text: string }[] {
  const chips: { icon: AppIcon; text: string | null }[] = [
    { icon: Rows, text: p.heightCm ? formatFeet(p.heightCm) : null },
    { icon: GraduationCap, text: p.education },
    { icon: Briefcase, text: [p.occupation, p.workLocation].filter(Boolean).join(' · ') || null },
    { icon: MapPin, text: branchName(p.branch, language) === p.place ? p.place : `${p.place} · ${branchName(p.branch, language)}` },
    { icon: Utensils, text: p.diet ? t(`matrimony.diet.${p.diet}`) : null },
    { icon: House, text: gotraName(p.gotra, language) ? t('matrimony.kulLine', { kul: gotraName(p.gotra, language) ?? '' }) : null },
  ];
  return chips.filter((c): c is { icon: AppIcon; text: string } => Boolean(c.text));
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

/** How the checklist names each missing field. */
export const MISSING_LABEL: Record<MissingField, MessageKey> = {
  gotra: 'matrimony.missing.gotra',
  surname: 'matrimony.surname',
  firstName: 'matrimony.firstName',
  fatherName: 'matrimony.fatherName',
  heightCm: 'matrimony.height',
  maritalStatus: 'matrimony.maritalStatus',
  manglik: 'matrimony.manglik',
  birthDate: 'matrimony.birthDate',
  birthTimeOfDay: 'matrimony.birthTime',
  birthPlace: 'matrimony.birthPlace',
  educationLevel: 'matrimony.educationLevel',
  education: 'matrimony.degree',
  occupation: 'member.occupation',
  employerType: 'matrimony.employerType',
  monthlyIncome: 'matrimony.monthlyIncome',
  parentName: 'matrimony.parentName',
  nativeVillage: 'matrimony.nativeVillage',
  nativeDistrict: 'matrimony.nativeDistrict',
  mamaName: 'matrimony.mamaName',
  mamaKul: 'matrimony.mamaKul',
  addressLine: 'matrimony.addressLine',
  village: 'matrimony.village',
  taluka: 'matrimony.taluka',
  district: 'matrimony.district',
  pincode: 'matrimony.pincode',
  candidateMobile: 'matrimony.candidateMobile',
  parentWhatsapp: 'matrimony.parentWhatsapp',
  disabilityDetail: 'matrimony.disabilityDetail',
};
