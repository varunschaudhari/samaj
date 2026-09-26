import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@samaj/shared';
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '@/lib/api';
import { type MessageKey, en } from './en';
import { mr } from './mr';

export type { MessageKey };

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, mr };

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

/** The chosen language, remembered on this device. English until someone changes it. */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'samaj.language',
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LanguageState> | undefined)?.language;
        return { ...current, language: stored && LANGUAGES.includes(stored) ? stored : current.language };
      },
    },
  ),
);

// lang="mr" switches both fonts to Marathi letterforms and tells screen readers
// which voice to use.
function syncDocumentLanguage(language: Language) {
  document.documentElement.lang = language;
}
syncDocumentLanguage(useLanguageStore.getState().language);
useLanguageStore.subscribe((state) => syncDocumentLanguage(state.language));

const MARATHI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** Numbers in Devanagari digits for Marathi, grouped Indian-style (1,24,800). */
export function formatNumber(value: number, language: Language): string {
  const grouped = new Intl.NumberFormat('en-IN').format(value);
  return language === 'mr' ? grouped.replace(/\d/g, (d) => MARATHI_DIGITS[Number(d)] ?? d) : grouped;
}

/** "26 Sept 2026" in English, "२६ सप्टें, २०२६" in Marathi. */
export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'mr' ? 'mr-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function translate(language: Language, key: MessageKey, values?: Record<string, string | number>): string {
  const template = dictionaries[language][key] ?? en[key];
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value, language) : value;
  });
}

export function isMessageKey(value: string): value is MessageKey {
  return value in en;
}

export function useT() {
  const language = useLanguageStore((s) => s.language);
  return useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(language, key, values),
    [language],
  );
}

/** A user-facing message for any error thrown by the API client or elsewhere. */
export function useErrorMessage() {
  const t = useT();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        const key = `error.${error.code}`;
        return isMessageKey(key) ? t(key) : error.message;
      }
      return t('error.INTERNAL');
    },
    [t],
  );
}
