import mongoose from 'mongoose';
import { getConfig } from '../../config/config.js';
import { logger } from '../../logger/logger.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    return;
  }

  const config = getConfig();

  try {
    await mongoose.connect(config.MONGODB_URI);
    isConnected = true;
    logger.info('Connected to MongoDB', { uri: config.MONGODB_URI });
  } catch (error) {
    isConnected = false;
    logger.error('Failed to connect to MongoDB', { error: String(error) });
    throw new PersistenceError('Failed to connect to database', { cause: error });
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Failed to disconnect from MongoDB', { error: String(error) });
    throw new PersistenceError('Failed to disconnect from database', { cause: error });
  }
}

export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
