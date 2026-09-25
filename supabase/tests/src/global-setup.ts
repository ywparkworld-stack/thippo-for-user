import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { adminUrl, serverAdminUrl, target, testDbName } from './env';

const root = join(import.meta.dirname, '..', '..');

export default async function setup(): Promise<void> {
  if (target !== 'plain') return;

  const server = new pg.Client({ connectionString: serverAdminUrl });
  await server.connect();
  await server.query(`drop database if exists ${testDbName} with (force)`);
  await server.query(`create database ${testDbName}`);
  await server.end();

  const db = new pg.Client({ connectionString: adminUrl });
  await db.connect();
  try {
    await db.query(readFileSync(join(root, 'tests', 'shim', 'supabase-shim.sql'), 'utf8'));
    const dir = join(root, 'migrations');
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      try {
        await db.query(readFileSync(join(dir, file), 'utf8'));
      } catch (e) {
        throw new Error(`migration ${file} failed: ${(e as Error).message}`, { cause: e });
      }
    }
    await db.query(readFileSync(join(root, 'seed.sql'), 'utf8'));
  } finally {
    await db.end();
  }
}
