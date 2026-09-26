import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger';

const INCOMING_ID = /^[\w-]{8,64}$/;

/** Logs each request with a request id, reusing a caller's x-request-id when it looks sane. */
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health checks and photo loads are most of the traffic and say little.
  autoLogging: { ignore: (req) => req.url === '/api/health' || (req.method === 'GET' && /\/photo(\?|$)/.test(req.url ?? '')) },
});
