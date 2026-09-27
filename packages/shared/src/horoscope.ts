/**
 * Rashi (moon sign) and nakshatra (birth star), as families write them on a
 * biodata. Like gotras, the database stores the id and the app shows the name
 * in the reader's language.
 */
export const RASHIS = [
  { id: 'mesh', en: 'Mesh (Aries)', mr: 'मेष' },
  { id: 'vrishabh', en: 'Vrishabh (Taurus)', mr: 'वृषभ' },
  { id: 'mithun', en: 'Mithun (Gemini)', mr: 'मिथुन' },
  { id: 'kark', en: 'Kark (Cancer)', mr: 'कर्क' },
  { id: 'simha', en: 'Simha (Leo)', mr: 'सिंह' },
  { id: 'kanya', en: 'Kanya (Virgo)', mr: 'कन्या' },
  { id: 'tula', en: 'Tula (Libra)', mr: 'तूळ' },
  { id: 'vrishchik', en: 'Vrishchik (Scorpio)', mr: 'वृश्चिक' },
  { id: 'dhanu', en: 'Dhanu (Sagittarius)', mr: 'धनु' },
  { id: 'makar', en: 'Makar (Capricorn)', mr: 'मकर' },
  { id: 'kumbh', en: 'Kumbh (Aquarius)', mr: 'कुंभ' },
  { id: 'meen', en: 'Meen (Pisces)', mr: 'मीन' },
] as const;

export const NAKSHATRAS = [
  { id: 'ashwini', en: 'Ashwini', mr: 'अश्विनी' },
  { id: 'bharani', en: 'Bharani', mr: 'भरणी' },
  { id: 'krittika', en: 'Krittika', mr: 'कृत्तिका' },
  { id: 'rohini', en: 'Rohini', mr: 'रोहिणी' },
  { id: 'mrigashira', en: 'Mrigashira', mr: 'मृगशीर्ष' },
  { id: 'ardra', en: 'Ardra', mr: 'आर्द्रा' },
  { id: 'punarvasu', en: 'Punarvasu', mr: 'पुनर्वसू' },
  { id: 'pushya', en: 'Pushya', mr: 'पुष्य' },
  { id: 'ashlesha', en: 'Ashlesha', mr: 'आश्लेषा' },
  { id: 'magha', en: 'Magha', mr: 'मघा' },
  { id: 'purvaPhalguni', en: 'Purva Phalguni', mr: 'पूर्वा फाल्गुनी' },
  { id: 'uttaraPhalguni', en: 'Uttara Phalguni', mr: 'उत्तरा फाल्गुनी' },
  { id: 'hasta', en: 'Hasta', mr: 'हस्त' },
  { id: 'chitra', en: 'Chitra', mr: 'चित्रा' },
  { id: 'swati', en: 'Swati', mr: 'स्वाती' },
  { id: 'vishakha', en: 'Vishakha', mr: 'विशाखा' },
  { id: 'anuradha', en: 'Anuradha', mr: 'अनुराधा' },
  { id: 'jyeshtha', en: 'Jyeshtha', mr: 'ज्येष्ठा' },
  { id: 'mula', en: 'Mula', mr: 'मूळ' },
  { id: 'purvaAshadha', en: 'Purva Ashadha', mr: 'पूर्वाषाढा' },
  { id: 'uttaraAshadha', en: 'Uttara Ashadha', mr: 'उत्तराषाढा' },
  { id: 'shravana', en: 'Shravana', mr: 'श्रवण' },
  { id: 'dhanishta', en: 'Dhanishta', mr: 'धनिष्ठा' },
  { id: 'shatabhisha', en: 'Shatabhisha', mr: 'शततारका' },
  { id: 'purvaBhadrapada', en: 'Purva Bhadrapada', mr: 'पूर्वा भाद्रपदा' },
  { id: 'uttaraBhadrapada', en: 'Uttara Bhadrapada', mr: 'उत्तरा भाद्रपदा' },
  { id: 'revati', en: 'Revati', mr: 'रेवती' },
] as const;

export type RashiId = (typeof RASHIS)[number]['id'];
export type NakshatraId = (typeof NAKSHATRAS)[number]['id'];

export const RASHI_IDS = RASHIS.map((r) => r.id) as [RashiId, ...RashiId[]];
export const NAKSHATRA_IDS = NAKSHATRAS.map((n) => n.id) as [NakshatraId, ...NakshatraId[]];

export function rashiName(id: string | null | undefined, language: 'en' | 'mr'): string | null {
  const rashi = RASHIS.find((r) => r.id === id);
  return rashi ? rashi[language] : null;
}

export function nakshatraName(id: string | null | undefined, language: 'en' | 'mr'): string | null {
  const nakshatra = NAKSHATRAS.find((n) => n.id === id);
  return nakshatra ? nakshatra[language] : null;
}
