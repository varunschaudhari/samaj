import type { InvitationKind, Language } from '@samaj/shared';
import { isRemembrance } from './kinds';

/*
 * Ready-made occasions: the functions a family usually holds, at the usual
 * times, around one main day. And traditional lines for the card's message.
 * Starting points: everything stays editable.
 */

export interface TemplateFunction {
  name: string;
  /** Days from the main day: -1 the day before. */
  day: number;
  /** "17:00", local time. */
  time: string;
  hours: number;
}

export type TemplateId =
  | 'weddingFull'
  | 'weddingSimple'
  | 'engagement'
  | 'munj'
  | 'naming'
  | 'babyShower'
  | 'housewarming'
  | 'birthday'
  | 'shashtyabdi'
  | 'dashakriya'
  | 'uttarkarya'
  | 'shraddha'
  | 'varshashraddha';

export interface OccasionTemplate {
  id: TemplateId;
  kind: InvitationKind;
  functions: TemplateFunction[];
}

export const TEMPLATES: OccasionTemplate[] = [
  {
    id: 'weddingFull',
    kind: 'wedding',
    functions: [
      { name: 'साखरपुडा', day: -1, time: '11:00', hours: 3 },
      { name: 'हळद', day: -1, time: '17:00', hours: 3 },
      { name: 'लग्न', day: 0, time: '11:00', hours: 3 },
      { name: 'स्वागत समारंभ', day: 0, time: '19:00', hours: 3 },
    ],
  },
  {
    id: 'weddingSimple',
    kind: 'wedding',
    functions: [
      { name: 'हळद', day: -1, time: '17:00', hours: 3 },
      { name: 'लग्न', day: 0, time: '11:00', hours: 3 },
    ],
  },
  { id: 'engagement', kind: 'engagement', functions: [{ name: 'साखरपुडा', day: 0, time: '11:00', hours: 2 }, { name: 'भोजन', day: 0, time: '13:00', hours: 2 }] },
  { id: 'munj', kind: 'munj', functions: [{ name: 'मुंज', day: 0, time: '09:00', hours: 3 }, { name: 'भोजन', day: 0, time: '12:30', hours: 2 }] },
  { id: 'naming', kind: 'naming', functions: [{ name: 'बारसे', day: 0, time: '17:00', hours: 2 }, { name: 'भोजन', day: 0, time: '19:30', hours: 2 }] },
  { id: 'babyShower', kind: 'babyShower', functions: [{ name: 'डोहाळे जेवण', day: 0, time: '12:00', hours: 3 }] },
  { id: 'housewarming', kind: 'housewarming', functions: [{ name: 'वास्तुशांती', day: 0, time: '08:00', hours: 3 }, { name: 'भोजन', day: 0, time: '12:30', hours: 2 }] },
  { id: 'birthday', kind: 'birthday', functions: [{ name: 'वाढदिवस', day: 0, time: '19:00', hours: 3 }] },
  { id: 'shashtyabdi', kind: 'shashtyabdi', functions: [{ name: 'षष्ट्यब्दीपूर्ती सोहळा', day: 0, time: '10:00', hours: 3 }, { name: 'भोजन', day: 0, time: '13:00', hours: 2 }] },
  { id: 'dashakriya', kind: 'dashakriya', functions: [{ name: 'दशक्रिया विधी', day: 0, time: '08:00', hours: 3 }] },
  { id: 'uttarkarya', kind: 'uttarkarya', functions: [{ name: 'उत्तरकार्य', day: 0, time: '09:00', hours: 3 }, { name: 'भोजन', day: 0, time: '12:30', hours: 2 }] },
  { id: 'shraddha', kind: 'shraddha', functions: [{ name: 'श्राद्ध', day: 0, time: '11:00', hours: 2 }] },
  { id: 'varshashraddha', kind: 'varshashraddha', functions: [{ name: 'वर्षश्राद्ध', day: 0, time: '11:00', hours: 2 }, { name: 'भोजन', day: 0, time: '13:00', hours: 2 }] },
];

export const templatesFor = (kind: InvitationKind) => TEMPLATES.filter((t) => t.kind === kind);

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM-DDTHH:mm" for a datetime-local input, `day` days from `mainDay` ("YYYY-MM-DD"). */
function localAt(mainDay: string, day: number, time: string, addHours = 0) {
  const [y, m, d] = mainDay.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const at = new Date(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + day, (hh ?? 0) + addHours, mm ?? 0);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The template's functions, timed around the main day. */
export function templateFunctions(tpl: OccasionTemplate, mainDay: string) {
  return tpl.functions.map((f) => ({ name: f.name, startsLocal: localAt(mainDay, f.day, f.time), endsLocal: localAt(mainDay, f.day, f.time, f.hours) }));
}

/** Lines a patrika often carries, for the message. */
export interface Wording {
  for: InvitationKind[] | 'celebration' | 'remembrance';
  text: Record<Language, string>;
}

export const WORDINGS: Wording[] = [
  {
    for: ['wedding', 'engagement'],
    text: {
      mr: 'आमच्या येथे होणाऱ्या शुभविवाहास आपण सहकुटुंब सहपरिवार उपस्थित राहून वधूवरांस शुभाशीर्वाद द्यावेत, ही नम्र विनंती.',
      en: 'We warmly request you and your family to attend and bless the couple.',
    },
  },
  { for: ['wedding'], text: { mr: 'आपली उपस्थिती हाच आमचा आहेर.', en: 'Your presence is the only gift we ask for.' } },
  {
    for: ['munj'],
    text: {
      mr: 'व्रतबंधाच्या शुभप्रसंगी आपण सहकुटुंब उपस्थित राहून बटूस आशीर्वाद द्यावेत, ही विनंती.',
      en: 'Please join us with your family and bless the child on the occasion of his thread ceremony.',
    },
  },
  {
    for: ['naming', 'babyShower', 'birthday'],
    text: { mr: 'या आनंदाच्या प्रसंगी आपण सहकुटुंब उपस्थित राहून बाळास आशीर्वाद द्यावेत.', en: 'Please join us with your family and bless the little one.' },
  },
  {
    for: 'celebration',
    text: { mr: 'या शुभ प्रसंगी आपण सहकुटुंब उपस्थित राहून आमचा आनंद द्विगुणित करावा.', en: 'Your presence with your family will double our joy on this happy occasion.' },
  },
  {
    for: 'remembrance',
    text: {
      mr: 'दिवंगत आत्म्यास शांती लाभावी यासाठी होणाऱ्या विधीस आपण उपस्थित राहावे, ही नम्र विनंती.',
      en: 'We humbly request your presence at the rites for the peace of the departed soul.',
    },
  },
  { for: 'remembrance', text: { mr: 'दुःखाच्या या प्रसंगी आपली उपस्थिती आम्हास आधार देईल.', en: 'Your presence will give us strength at this time of grief.' } },
];

/** The lines that suit an occasion, most particular first. */
export function wordingsFor(kind: InvitationKind): Wording[] {
  const group = isRemembrance(kind) ? 'remembrance' : 'celebration';
  return [...WORDINGS.filter((w) => Array.isArray(w.for) && w.for.includes(kind)), ...WORDINGS.filter((w) => w.for === group)];
}
