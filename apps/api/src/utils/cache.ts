/**
 * A tiny in-process cache for small, rarely changing data (the branch tree).
 * Each API process has its own copy: a change clears it here at once, and
 * other processes pick it up when their copy expires.
 */
const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { at: Date.now(), value });
  // A failed load isn't kept.
  value.catch(() => entries.delete(key));
  return value;
}

export function invalidate(prefix: string) {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}
