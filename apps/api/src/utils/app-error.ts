import type { ErrorCode, FieldIssue } from '@samaj/shared';

/**
 * An error that is safe to show the client. Anything thrown that isn't an
 * AppError (or a ZodError) becomes a generic 500 with no details.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: FieldIssue[] | undefined;

  constructor(status: number, code: ErrorCode, message: string, issues?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export const unauthenticated = (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = "Your role doesn't allow this.") => new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'That record no longer exists.') => new AppError(404, 'NOT_FOUND', message);
