/**
 * The gotras a family can choose from. This is the only place the list lives:
 * the API validates against it, and the web app builds its dropdowns and
 * filter from it.
 *
 * PLACEHOLDER: these six are generic examples used during development.
 * Replace them with the samaj's actual list. Keep each `id` stable once real
 * families use it, because the database stores the id, not the name.
 */
export const GOTRAS = [
  { id: 'kashyap', en: 'Kashyap', mr: 'कश्यप' },
  { id: 'bharadwaj', en: 'Bharadwaj', mr: 'भारद्वाज' },
  { id: 'vasishtha', en: 'Vasishtha', mr: 'वसिष्ठ' },
  { id: 'gautam', en: 'Gautam', mr: 'गौतम' },
  { id: 'atri', en: 'Atri', mr: 'अत्रि' },
  { id: 'jamadagni', en: 'Jamadagni', mr: 'जमदग्नी' },
] as const;

export type GotraId = (typeof GOTRAS)[number]['id'];

export const GOTRA_IDS = GOTRAS.map((g) => g.id) as [GotraId, ...GotraId[]];

export function isGotraId(value: string): value is GotraId {
  return (GOTRA_IDS as readonly string[]).includes(value);
}

/** The gotra's name in the given language, or null for an unknown or missing id. */
export function gotraName(id: string | null | undefined, language: 'en' | 'mr'): string | null {
  const gotra = GOTRAS.find((g) => g.id === id);
  return gotra ? gotra[language] : null;
}
