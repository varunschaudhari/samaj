// argon2 hashing and file reads share libuv's thread pool, and its default of
// 4 threads stalls under a burst of sign-ins. The pool starts on first use,
// which is after this line even though imports are hoisted above it.
process.env.UV_THREADPOOL_SIZE ??= '16';

import cluster from 'node:cluster';
import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { lifecycle } from './routes';
import { purgeDue } from './services/privacy.service';
import { logger } from './utils/logger';

/** WEB_CONCURRENCY > 1 runs that many API processes on this machine, sharing the port. */
function startCluster() {
  logger.info({ processes: env.WEB_CONCURRENCY }, 'Starting API processes');
  for (let i = 0; i < env.WEB_CONCURRENCY; i++) cluster.fork();
  let stopping = false;
  cluster.on('exit', (worker, code) => {
    if (stopping) return;
    logger.error({ pid: worker.process.pid, code }, 'API process exited; starting another');
    cluster.fork();
  });
  const stop = () => {
    stopping = true;
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill('SIGTERM');
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function main() {
  await connectDb(env.MONGODB_URI);

  const server = createApp().listen(env.API_PORT, () => {
    logger.info(`API listening on http://localhost:${env.API_PORT}`);
  });
  // Longer than a load balancer's idle timeout (often 60s), so it never
  // reuses a connection Node has just closed, which shows up as random 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  // Deletions whose grace period has ended are erased within the hour. Safe to
  // run in several processes at once: each erase is idempotent.
  const purge = () => purgeDue().catch((err: unknown) => logger.error({ err }, 'Privacy purge failed'));
  setInterval(purge, 60 * 60_000).unref();
  void purge();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    lifecycle.draining = true;
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // Let in-flight requests finish; close connections that are only waiting.
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 25_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

if (env.WEB_CONCURRENCY > 1 && cluster.isPrimary) {
  startCluster();
} else {
  main().catch((err: unknown) => {
    logger.fatal({ err }, "API didn't start. Is MongoDB running? Try: npm run db:up");
    process.exit(1);
  });
}
