import type { ApiErrorBody, ErrorCode, FieldIssue } from '@samaj/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, notFound } from '../utils/app-error';

export const notFoundHandler: RequestHandler = () => {
  throw notFound("There's nothing at this address.");
};

function send(res: Parameters<ErrorRequestHandler>[2], status: number, code: ErrorCode, message: string, requestId: string, issues?: FieldIssue[]) {
  const body: ApiErrorBody = { error: { code, message, requestId, ...(issues && { issues }) } };
  res.status(status).json(body);
}

/**
 * The only place error responses are written. Never includes stack traces or
 * internal messages: unknown errors are logged in full and the client gets a
 * generic message plus the request id to quote.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) return next(err);
  const requestId = String(req.id);

  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return send(res, 400, 'VALIDATION_FAILED', 'Some fields need fixing.', requestId, issues);
  }

  if (err instanceof AppError) {
    return send(res, err.status, err.code, err.message, requestId, err.issues);
  }

  // Errors raised by express.json() carry a `type` and a safe status.
  const bodyError = err as { type?: string; status?: number };
  if (bodyError.type === 'entity.parse.failed') {
    return send(res, 400, 'VALIDATION_FAILED', "The request body isn't valid JSON.", requestId);
  }
  if (bodyError.type === 'entity.too.large') {
    return send(res, 413, 'VALIDATION_FAILED', 'The request is too large.', requestId);
  }

  req.log.error({ err }, 'Unhandled error');
  return send(
    res,
    500,
    'INTERNAL',
    `Something failed on our side. Try again in a moment. If it keeps happening, give the committee this reference: ${requestId}`,
    requestId,
  );
};
