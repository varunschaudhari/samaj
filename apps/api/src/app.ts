import { CSRF_HEADER } from '@samaj/shared';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { csrfGuard } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limit';
import { requestLogger } from './middleware/request-logger';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use(requestLogger);
  app.use(helmet());
  // JSON shrinks five to ten times; photos are already compressed.
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/photo') && compression.filter(req, res) }));
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      allowedHeaders: ['content-type', CSRF_HEADER, 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter, csrfGuard, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
