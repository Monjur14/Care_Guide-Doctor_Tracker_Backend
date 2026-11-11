import mongoose from 'mongoose';
import { env, isProd } from './env';
import { logger } from './logger';

// Reject query filter keys that are not in the schema instead of silently dropping them.
mongoose.set('strictQuery', true);

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// Serverless functions are reused between invocations: keep one connection per instance.
const globalForMongoose = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

export async function connectDB(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 30_000,
      // Index builds are an explicit deploy step in production (npm run db:indexes).
      autoIndex: !isProd,
    });
  }
  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (err) {
    cache.promise = null;
    logger.error({ err }, 'MongoDB connection failed');
    throw err;
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
