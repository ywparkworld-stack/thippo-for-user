import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { adminUrl, apiUrl } from './env';

// timestamptz / tstzrange は文字列のまま扱う
pg.types.setTypeParser(1184, (v) => v);

/** スーパーユーザー（DB に直接接続した運営者）。テストデータの準備に使う */
export const adminPool = new pg.Pool({ connectionString: adminUrl, max: 4 });
/** PostgREST と同じ authenticator での接続。ロールを切り替えて使う */
export const apiPool = new pg.Pool({ connectionString: apiUrl, max: 8 });

export type Actor =
  { kind: 'anon' } | { kind: 'service_role' } | { kind: 'user'; id: string; aal?: 'aal1' | 'aal2' };

export const anon: Actor = { kind: 'anon' };
export const serviceRole: Actor = { kind: 'service_role' };
export const user = (id: string, aal: 'aal1' | 'aal2' = 'aal1'): Actor => ({
  kind: 'user',
  id,
  aal,
});

/** API 経由と同じ状態（ロールと JWT クレーム）でトランザクションを開始する。最後はロールバックする */
export async function as<T>(actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await apiPool.connect();
  try {
    await beginAs(c, actor);
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

export async function beginAs(c: pg.PoolClient, actor: Actor): Promise<void> {
  const role = actor.kind === 'user' ? 'authenticated' : actor.kind;
  const claims =
    actor.kind === 'user'
      ? { sub: actor.id, role: 'authenticated', aal: actor.aal ?? 'aal1' }
      : { role: actor.kind };
  await c.query('begin');
  await c.query(`set local role ${role}`);
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
}

/** 期待したエラー（SQLSTATE）で失敗することを確認する */
export async function expectPgError(
  p: Promise<unknown>,
  code: string,
  message?: RegExp,
): Promise<void> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message: string };
    if (err.code !== code)
      throw new Error(`expected SQLSTATE ${code} but got ${err.code}: ${err.message}`);
    if (message && !message.test(err.message))
      throw new Error(`unexpected message: ${err.message}`);
    return;
  }
  throw new Error(`expected SQLSTATE ${code} but the query succeeded`);
}

// ---------------------------------------------------------------------------
// テストデータ（コミットされる。ID はすべてランダム）
// ---------------------------------------------------------------------------

export async function createUser(
  opts: { role?: 'guest' | 'host' | 'admin' } = {},
): Promise<string> {
  const email = `${randomUUID()}@test.thippo.example`;
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [email],
  );
  const id = rows[0]!.id;
  if (opts.role && opts.role !== 'guest') {
    await adminPool.query(`update public.profiles set role = $2 where id = $1`, [id, opts.role]);
  }
  return id;
}

export async function createHost(
  opts: { ready?: boolean; status?: 'applied' | 'active' | 'suspended'; members?: string[] } = {},
): Promise<string> {
  const ready = opts.ready ?? true;
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into public.hosts (company_name, status, charges_enabled, payouts_enabled)
     values ('テスト株式会社', $1, $2, $2) returning id`,
    [opts.status ?? 'active', ready],
  );
  const id = rows[0]!.id;
  for (const m of opts.members ?? []) {
    await adminPool.query(`insert into public.host_members (host_id, user_id) values ($1, $2)`, [
      id,
      m,
    ]);
  }
  return id;
}

export async function createSpace(
  hostId: string,
  opts: { price?: number; minSlots?: number; status?: 'draft' | 'published' | 'suspended' } = {},
): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into public.spaces (host_id, name, capacity, price_per_30min, min_slots, status)
     values ($1, 'テスト会議室', 10, $2, $3, $4) returning id`,
    [hostId, opts.price ?? 1000, opts.minSlots ?? 1, opts.status ?? 'published'],
  );
  return rows[0]!.id;
}

export async function createOrder(guestId: string, hostId: string, total = 0): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into public.orders (guest_id, host_id, total, application_fee_amount, expires_at)
     values ($1, $2, $3, 0, now() + interval '15 minutes') returning id`,
    [guestId, hostId, total],
  );
  return rows[0]!.id;
}

export interface BookingInput {
  orderId: string;
  spaceId: string;
  hostId: string;
  guestId: string;
  start: string;
  end: string;
  price?: number;
  status?: 'pending' | 'confirmed';
}

export const bookingInsertSql = `
  insert into public.bookings (order_id, space_id, host_id, guest_id, period, slots, price_per_30min, total, status)
  values ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'),
          public.period_slots(tstzrange($5::timestamptz, $6::timestamptz, '[)')), $7,
          $7 * public.period_slots(tstzrange($5::timestamptz, $6::timestamptz, '[)')), $8)
  returning id`;

export function bookingParams(b: BookingInput): unknown[] {
  return [
    b.orderId,
    b.spaceId,
    b.hostId,
    b.guestId,
    b.start,
    b.end,
    b.price ?? 1000,
    b.status ?? 'pending',
  ];
}

export async function createBooking(b: BookingInput): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(bookingInsertSql, bookingParams(b));
  return rows[0]!.id;
}

/** 重ならない日時を作るための一意な日（テストごとにずらす） */
let dayCounter = 0;
export function uniqueDay(): string {
  dayCounter += 1;
  const d = new Date(
    Date.UTC(2027, 0, 1) + (Math.floor(Math.random() * 3000) * 7 + dayCounter) * 86_400_000,
  );
  return d.toISOString().slice(0, 10);
}
