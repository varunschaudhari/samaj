export const LANGUAGES = ['en', 'mr'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Header the web client sends on every mutating request. See apps/api/src/middleware/csrf.ts. */
export const CSRF_HEADER = 'x-samaj-client';
export const CSRF_HEADER_VALUE = 'web';

export const ACCESS_COOKIE = 'samaj_at';
export const REFRESH_COOKIE = 'samaj_rt';

export const MEMBER_PAGE_SIZE = 20;
