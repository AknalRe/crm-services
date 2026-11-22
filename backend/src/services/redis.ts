import Redis from 'ioredis';
import { config } from '../config';

export const isTestRuntime =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test');

export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: isTestRuntime,
  retryStrategy(times) {
    if (isTestRuntime) return null;
    const delay = Math.min(times * 500, 3000);
    return delay;
  },
});

redisConnection.on('connect', () => {
  if (!isTestRuntime) {
    console.log('[Redis] Connected successfully');
  }
});

redisConnection.on('error', (err) => {
  if (!isTestRuntime) {
    console.error('[Redis] Connection error:', err.message);
  }
});

export default redisConnection;

