export const LANGUAGES = ['en', 'mr'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Header the web client sends on every mutating request. See apps/api/src/middleware/csrf.ts. */
export const CSRF_HEADER = 'x-samaj-client';
export const CSRF_HEADER_VALUE = 'web';

export const ACCESS_COOKIE = 'samaj_at';
export const REFRESH_COOKIE = 'samaj_rt';

export const MEMBER_PAGE_SIZE = 20;

/** Verification happens per family: a committee member reviews the whole household at once. */
export const FAMILY_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type FamilyStatus = (typeof FAMILY_STATUSES)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];
