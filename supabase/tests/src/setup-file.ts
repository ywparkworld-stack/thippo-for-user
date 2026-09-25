import { afterAll } from 'vitest';
import { adminPool, apiPool } from './db';

afterAll(async () => {
  await Promise.all([adminPool.end(), apiPool.end()]);
});
