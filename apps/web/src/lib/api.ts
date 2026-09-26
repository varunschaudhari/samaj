import { type ApiErrorBody, CSRF_HEADER, CSRF_HEADER_VALUE, type ErrorCode, type FieldIssue } from '@samaj/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly issues: FieldIssue[];
  readonly requestId: string | undefined;

  constructor(status: number, code: ClientErrorCode, message: string, issues: FieldIssue[] = [], requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.requestId = requestId;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value && typeof (value as ApiErrorBody).error?.code === 'string';
}

// Auth endpoints that must never trigger a refresh-and-retry.
const NO_REFRESH = new Set(['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout', '/auth/reset-password']);

let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

/** Called once a refresh has failed, so the app can drop the cached user. */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

/** One refresh at a time: parallel 401s all wait on the same request. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send this as-is (e.g. an image) instead of JSON-encoding `body`. */
  raw?: { data: Blob; contentType: string };
  query?: Query;
  signal?: AbortSignal | undefined;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

async function request<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const { method = 'GET', body, raw, query, signal } = options;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: {
        [CSRF_HEADER]: CSRF_HEADER_VALUE,
        ...(raw && { 'content-type': raw.contentType }),
        ...(!raw && body !== undefined && { 'content-type': 'application/json' }),
      },
      body: raw ? raw.data : body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', "Couldn't reach Samaj. Check your connection and try again.");
  }

  if (res.status === 401 && allowRefresh && !NO_REFRESH.has(path)) {
    if (await refreshSession()) return request<T>(path, options, false);
    onSessionExpired?.();
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isErrorBody(data)) {
      const { code, message, issues, requestId } = data.error;
      throw new ApiError(res.status, code, message, issues, requestId);
    }
    throw new ApiError(res.status, 'INTERNAL', 'The server sent an unexpected response.');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, data: Blob) => request<T>(path, { method: 'PUT', raw: { data, contentType: data.type } }),
};
