import { z } from 'zod';

/*
 * Validation messages in this package are dictionary keys, not sentences.
 * The web app translates them (apps/web/src/i18n); the API passes them through
 * in error responses so the client can translate server-side failures too.
 */

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'validation.invalidId');

/**
 * Indian mobile number. Accepts what people actually type ("98220 12345",
 * "+91-9822012345", "09822012345") and normalises to E.164 (+919822012345).
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s\-().]/g, ''))
  .transform((digits) => digits.replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'validation.phone'))
  .transform((local) => `+91${local}`);

export function formatPhone(e164: string): string {
  const local = e164.replace(/^\+91/, '');
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
