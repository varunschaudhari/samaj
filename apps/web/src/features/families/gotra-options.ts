import { GOTRAS, type GotraId, type Language } from '@samaj/shared';

/** The fixed gotra list as dropdown options, alphabetical in the current language. */
export function gotraOptions(language: Language): { id: GotraId; name: string }[] {
  return GOTRAS.map((g) => ({ id: g.id, name: g[language] })).sort((a, b) => a.name.localeCompare(b.name, language));
}
