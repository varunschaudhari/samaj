import { type InvitationDetail, type InvitationFunction, type InvitationKind, type InvitationTheme, type PatrikaText, REMEMBRANCE_KINDS } from '@samaj/shared';
import { formatEventTime } from '@/features/community/events-api';
import type { Language } from '@samaj/shared';

export const isRemembrance = (kind: InvitationKind) => REMEMBRANCE_KINDS.includes(kind);

export const CELEBRATIONS: InvitationKind[] = ['wedding', 'engagement', 'munj', 'naming', 'babyShower', 'housewarming', 'birthday', 'shashtyabdi', 'other'];
export const REMEMBRANCES: InvitationKind[] = ['dashakriya', 'uttarkarya', 'shraddha', 'varshashraddha'];

/** Functions an occasion usually has, offered as one-tap names. Written as families write them. */
export const FUNCTION_NAMES: Record<InvitationKind, string[]> = {
  wedding: ['साखरपुडा', 'हळद', 'मेहंदी', 'लग्न', 'स्वागत समारंभ'],
  engagement: ['साखरपुडा', 'भोजन'],
  munj: ['मुंज', 'भोजन'],
  naming: ['बारसे', 'भोजन'],
  babyShower: ['डोहाळे जेवण'],
  housewarming: ['वास्तुशांती', 'गृहप्रवेश', 'भोजन'],
  birthday: ['वाढदिवस'],
  shashtyabdi: ['षष्ट्यब्दीपूर्ती सोहळा', 'भोजन'],
  dashakriya: ['दशक्रिया विधी'],
  uttarkarya: ['उत्तरकार्य', 'भोजन'],
  shraddha: ['श्राद्ध'],
  varshashraddha: ['वर्षश्राद्ध'],
  other: [],
};

/** The text for WhatsApp: occasion, whose, each function with its time and place, and the link. */
export function shareText(inv: Pick<InvitationDetail, 'forNames' | 'functions' | 'message'>, labels: { kind: string; from: string; open: string }, language: Language, url: string) {
  return [
    `*${labels.kind}${inv.forNames ? `: ${inv.forNames}` : ''}*`,
    labels.from,
    '',
    ...inv.functions.map((f) => `• ${f.name}: ${formatEventTime(f.startsAt, f.endsAt, language)}, ${f.venue}`),
    ...(inv.message ? ['', inv.message] : []),
    '',
    `${labels.open} ${url}`,
  ].join('\n');
}

/** The muhurat's time, with the day only when it differs from the function's: "11:34 am". */
export function muhuratText(muhuratAt: string, startsAt: string, language: Language) {
  const m = new Date(muhuratAt);
  const loc = language === 'mr' ? 'mr-IN' : 'en-IN';
  const time = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(m);
  if (m.toDateString() === new Date(startsAt).toDateString()) return time;
  return `${new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' }).format(m)} · ${time}`;
}

/** The card's content from an invitation as the API gives it; `base` is where its photos are served. */
export function cardFrom(inv: PatrikaText & { kind: InvitationKind; theme?: InvitationTheme | null; forNames: string | null; message: string | null; functions: InvitationFunction[] }, hostName: string, base: string) {
  return {
    kind: inv.kind,
    theme: inv.theme ?? null,
    forNames: inv.forNames,
    message: inv.message,
    hostName,
    functions: inv.functions,
    honorees: inv.honorees,
    kripa: inv.kripa,
    blessings: inv.blessings,
    inviters: inv.inviters,
    memorial: inv.memorial ? { years: inv.memorial.years, photoSrc: inv.memorial.photoVersion !== null ? `${base}/memorial-photo?v=${inv.memorial.photoVersion}` : null } : null,
  };
}
