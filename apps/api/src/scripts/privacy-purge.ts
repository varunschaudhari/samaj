/*
 * Erase every deletion whose grace period has ended. The API does this
 * hourly on its own; this script is for a scheduled job or a manual run:
 *   npm run privacy:purge            (development, from the repo root)
 *   node apps/api/dist/privacy-purge.js   (a built deployment)
 */
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { purgeDue } from '../services/privacy.service';
import { logger } from '../utils/logger';

async function main() {
  await connectDb(env.MONGODB_URI);
  const count = await purgeDue();
  logger.info({ count }, 'Privacy purge finished');
  await disconnectDb();
}

main().catch(async (err: unknown) => {
  logger.fatal({ err }, 'Privacy purge failed');
  await disconnectDb();
  process.exit(1);
});
