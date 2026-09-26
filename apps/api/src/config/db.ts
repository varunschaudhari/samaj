import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { env } from './env';

mongoose.set('strictQuery', true);

let closing = false;

export async function connectDb(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => !closing && logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: env.DB_POOL_SIZE,
    // A stuck query gives up instead of holding a connection.
    socketTimeoutMS: 30_000,
    // Building indexes on collections of lakhs at every boot would stall each
    // server as it starts. In production, run `npm run db:migrate` instead.
    autoIndex: env.NODE_ENV !== 'production',
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  closing = true;
  await mongoose.disconnect();
}
