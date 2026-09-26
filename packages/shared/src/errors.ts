export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'INVALID_RESET_CODE',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_VERIFIED',
  'NOT_FOUND',
  'CONFLICT',
  'PHONE_TAKEN',
  'RATE_LIMITED',
  'CSRF_REJECTED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldIssue {
  path: string;
  message: string;
}

/** Shape of every non-2xx JSON response from the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    issues?: FieldIssue[];
  };
}
