import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { type MessageKey, isMessageKey } from '@/i18n';
import { ApiError } from '@/lib/api';

/** Turn a schema message (a dictionary key) into text; unknown messages pass through. */
export function fieldError(t: (key: MessageKey) => string, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return isMessageKey(message) ? t(message) : message;
}

/**
 * Put server-side field issues on the matching inputs. Returns true when at
 * least one landed, so the caller can skip a generic banner.
 */
export function applyServerIssues<T extends FieldValues>(error: unknown, fields: readonly Path<T>[], setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError)) return false;
  let applied = false;
  for (const issue of error.issues) {
    const field = fields.find((f) => f === issue.path);
    if (field) {
      setError(field, { type: 'server', message: issue.message }, { shouldFocus: !applied });
      applied = true;
    }
  }
  return applied;
}
