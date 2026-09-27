import { type InvitationDetail, type InvitationKind, REMEMBRANCE_KINDS } from '@samaj/shared';
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
export function shareText(inv: InvitationDetail, labels: { kind: string; from: string; open: string }, language: Language, url: string) {
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
