import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env';

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'samaj-api';
const AUDIENCE = 'samaj-web';

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(accessKey);
}

/** Returns the user id, or null if the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function newRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function encodeRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function decodeRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const match = /^([a-f0-9]{24})\.([\w-]{43})$/.exec(token);
  if (!match?.[1] || !match[2]) return null;
  return { sessionId: match[1], secret: match[2] };
}

export const accessTokenMaxAgeMs = () => env.ACCESS_TOKEN_TTL_MINUTES * 60_000;
export const refreshTokenMaxAgeMs = () => env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
