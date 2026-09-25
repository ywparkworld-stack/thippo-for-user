import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { env } from './env';

export const PASSWORD = 'e2e-Password-123';

let pool: pg.Pool | undefined;
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: env.databaseUrl, max: 2 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

function admin() {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** メール確認済みのユーザーを作る。ロールの変更は DB に直接接続して行う（admin の付与と同じ手順） */
export async function createTestUser(
  role: 'guest' | 'host' | 'admin' = 'guest',
): Promise<TestUser> {
  const email = `e2e-${role}-${randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  if (role !== 'guest') {
    await db().query('update public.profiles set role = $2 where id = $1', [data.user.id, role]);
  }
  return { id: data.user.id, email, password: PASSWORD };
}

export async function setStatus(userId: string, status: 'active' | 'suspended'): Promise<void> {
  await db().query('update public.profiles set status = $2 where id = $1', [userId, status]);
}

export async function auditActions(userId: string): Promise<string[]> {
  const { rows } = await db().query<{ action: string }>(
    'select action from public.audit_logs where actor_id = $1 order by id',
    [userId],
  );
  return rows.map((r) => r.action);
}
