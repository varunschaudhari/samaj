import mongoose from 'mongoose';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

let closing = false;

export async function connectDb(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => !closing && logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  closing = true;
  await mongoose.disconnect();
}
