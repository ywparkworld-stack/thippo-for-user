import { beforeAll, describe, expect, it } from 'vitest';
import {
  adminPool,
  anon,
  as,
  createBooking,
  createHost,
  createOrder,
  createSpace,
  createUser,
  expectPgError,
  serviceRole,
  uniqueDay,
  user,
} from '../src/db';

// 登場人物: 利用者 A・B、貸出主 H1（担当 h1）・H2（担当 h2）、運営 admin
let guestA: string;
let guestB: string;
let h1: string;
let h2: string;
let admin: string;
let host1: string;
let host2: string;
let space1: string;
let space2: string;
let bookingA1: string; // A が H1 のスペースを予約
let bookingB2: string; // B が H2 のスペースを予約
let docA: string;
let docB: string;

beforeAll(async () => {
  guestA = await createUser();
  guestB = await createUser();
  h1 = await createUser({ role: 'host' });
  h2 = await createUser({ role: 'host' });
  admin = await createUser({ role: 'admin' });
  host1 = await createHost({ members: [h1] });
  host2 = await createHost({ members: [h2] });
  space1 = await createSpace(host1);
  space2 = await createSpace(host2);
  const day = uniqueDay();
  const orderA = await createOrder(guestA, host1, 2000);
  const orderB = await createOrder(guestB, host2, 2000);
  bookingA1 = await createBooking({
    orderId: orderA,
    spaceId: space1,
    hostId: host1,
    guestId: guestA,
    start: `${day}T10:00:00+09:00`,
    end: `${day}T11:00:00+09:00`,
  });
  bookingB2 = await createBooking({
    orderId: orderB,
    spaceId: space2,
    hostId: host2,
    guestId: guestB,
    start: `${day}T10:00:00+09:00`,
    end: `${day}T11:00:00+09:00`,
  });
  for (const b of [bookingA1, bookingB2]) {
    await adminPool.query(
      `insert into public.booking_fees (booking_id, hours, platform_fee_excl_tax, platform_fee_tax, stripe_fee_estimated, application_fee)
       values ($1, 1, 200, 20, 72, 292)`,
      [b],
    );
  }
  const docs = await adminPool.query<{ id: string }>(
    `insert into public.identity_documents (user_id, storage_path) values ($1::uuid, $1::text || '/a.png'), ($2::uuid, $2::text || '/b.png') returning id`,
    [guestA, guestB],
  );
  [docA, docB] = docs.rows.map((r) => r.id) as [string, string];
  await adminPool.query(
    `insert into public.audit_logs (actor_id, action) values ($1, 'test.setup')`,
    [admin],
  );
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('利用者', () => {
  it('他人の予約・注文・手数料は読めない', async () => {
    await as(user(guestA), async (c) => {
      const b = await c.query('select id from public.bookings where id = any($1)', [
        [bookingA1, bookingB2],
      ]);
      expect(ids(b.rows)).toEqual([bookingA1]);
      const o = await c.query('select guest_id from public.orders');
      expect(o.rows.every((r) => r.guest_id === guestA)).toBe(true);
      const f = await c.query(
        'select booking_id from public.booking_fees where booking_id = any($1)',
        [[bookingA1, bookingB2]],
      );
      expect(f.rows).toEqual([{ booking_id: bookingA1 }]);
    });
  });

  it('他人の本人確認書類は読めない', async () => {
    await as(user(guestA), async (c) => {
      const r = await c.query('select id from public.identity_documents where id = any($1)', [
        [docA, docB],
      ]);
      expect(ids(r.rows)).toEqual([docA]);
    });
  });

  it('本人確認書類は自分の分だけ pending で提出できる', async () => {
    await as(user(guestA), async (c) => {
      await c.query(
        `insert into public.identity_documents (user_id, storage_path) values ($1::uuid, $1::text || '/new.png')`,
        [guestA],
      );
    });
    await as(user(guestA), async (c) => {
      await expectPgError(
        c.query(
          `insert into public.identity_documents (user_id, storage_path) values ($1::uuid, $1::text || '/x.png')`,
          [guestB],
        ),
        '42501',
      );
    });
    await as(user(guestA), async (c) => {
      // 他人のフォルダのパス
      await expectPgError(
        c.query(
          `insert into public.identity_documents (user_id, storage_path) values ($1::uuid, $2::text || '/x.png')`,
          [guestA, guestB],
        ),
        '42501',
      );
    });
    await as(user(guestA), async (c) => {
      // status は列の権限がない
      await expectPgError(
        c.query(
          `insert into public.identity_documents (user_id, storage_path, status) values ($1::uuid, $1::text || '/x.png', 'approved')`,
          [guestA],
        ),
        '42501',
      );
    });
  });

  it('自分のロール・状態・本人確認状態は変更できない。表示名は変更できる', async () => {
    for (const col of [
      "role = 'admin'",
      "role = 'host'",
      "status = 'active'",
      "identity_status = 'approved'",
    ]) {
      await as(user(guestA), async (c) => {
        await expectPgError(
          c.query(`update public.profiles set ${col} where id = $1`, [guestA]),
          '42501',
        );
      });
    }
    await as(user(guestA), async (c) => {
      const r = await c.query(
        `update public.profiles set display_name = '山田' where id = $1 returning id`,
        [guestA],
      );
      expect(r.rowCount).toBe(1);
      // 他人のプロフィールは更新されない
      const o = await c.query(`update public.profiles set display_name = 'x' where id = $1`, [
        guestB,
      ]);
      expect(o.rowCount).toBe(0);
    });
  });

  it('他人のプロフィールは読めない', async () => {
    await as(user(guestA), async (c) => {
      const r = await c.query('select id from public.profiles');
      expect(ids(r.rows)).toEqual([guestA]);
    });
  });
});

describe('貸出主', () => {
  it('他社の予約・手数料は読めず、自社の予約は読める', async () => {
    await as(user(h1), async (c) => {
      const b = await c.query('select id from public.bookings where id = any($1)', [
        [bookingA1, bookingB2],
      ]);
      expect(ids(b.rows)).toEqual([bookingA1]);
      const f = await c.query(
        'select booking_id from public.booking_fees where booking_id = any($1)',
        [[bookingA1, bookingB2]],
      );
      expect(f.rows).toEqual([{ booking_id: bookingA1 }]);
      const h = await c.query('select id from public.hosts where id = any($1)', [[host1, host2]]);
      expect(ids(h.rows)).toEqual([host1]);
    });
  });

  it('他社のスペースは編集できない', async () => {
    await as(user(h1), async (c) => {
      const r = await c.query(`update public.spaces set name = 'x' where id = $1`, [space2]);
      expect(r.rowCount).toBe(0);
      await expectPgError(
        c.query(
          `insert into public.spaces (host_id, name, capacity, price_per_30min) values ($1, 'x', 1, 1000)`,
          [host2],
        ),
        '42501',
      );
    });
  });

  it('自社の状態・Stripe の設定は変更できない', async () => {
    for (const col of [
      "status = 'active'",
      'charges_enabled = true',
      "stripe_account_id = 'acct_x'",
    ]) {
      await as(user(h1), async (c) => {
        await expectPgError(
          c.query(`update public.hosts set ${col} where id = $1`, [host1]),
          '42501',
        );
      });
    }
  });

  it('スペースを公開停止（suspended）にしたり解除したりできない', async () => {
    await as(user(h1), async (c) => {
      await expectPgError(
        c.query(`update public.spaces set status = 'suspended' where id = $1`, [space1]),
        '42501',
      );
    });
    const suspended = await createSpace(host1, { status: 'suspended' });
    await as(user(h1), async (c) => {
      await expectPgError(
        c.query(`update public.spaces set status = 'published' where id = $1`, [suspended]),
        '42501',
      );
    });
  });

  it('Stripe のオンボーディングが終わるまで公開できない', async () => {
    const hNotReady = await createUser({ role: 'host' });
    const notReady = await createHost({ ready: false, members: [hNotReady] });
    const draft = await createSpace(notReady, { status: 'draft' });
    await as(user(hNotReady), async (c) => {
      await expectPgError(
        c.query(`update public.spaces set status = 'published' where id = $1`, [draft]),
        'P0001',
        /host_not_ready/,
      );
    });
  });

  it('host ロールでない担当者は自社のデータも読めない', async () => {
    const plain = await createUser();
    const h = await createHost({ members: [plain] });
    await as(user(plain), async (c) => {
      const r = await c.query('select id from public.hosts where id = $1', [h]);
      expect(r.rows).toEqual([]);
    });
  });
});

describe('運営用のデータ', () => {
  const adminTables = ['audit_logs', 'notifications', 'app_settings', 'host_applications'];

  it('利用者・貸出主は運営用のデータを読めない', async () => {
    for (const actor of [user(guestA), user(h1)]) {
      for (const t of adminTables) {
        await as(actor, async (c) => {
          const r = await c.query(`select 1 from public.${t}`);
          expect(r.rows).toEqual([]);
        });
      }
    }
  });

  it('admin 以外は運営用のデータ・お金のデータに書き込めない', async () => {
    const writes = [
      `insert into public.audit_logs (action) values ('x.y')`,
      `update public.app_settings set value = '1' where key = 'contact_email'`,
      `update public.identity_documents set status = 'approved' where id = '${docA}'`,
      `update public.profiles set status = 'suspended' where id = '${guestA}'`,
      `update public.hosts set status = 'suspended' where id = '${host1}'`,
      `insert into public.host_applications (company_name, contact_name, contact_email, address) values ('a','b','c@d','e')`,
      `insert into public.orders (guest_id, host_id, total, application_fee_amount, expires_at) values ('${guestA}', '${host1}', 0, 0, now())`,
      `update public.bookings set status = 'confirmed' where id = '${bookingA1}'`,
      `insert into public.refunds (booking_id, policy, refund_amount, transfer_reversal_amount) values ('${bookingA1}', 'full', 1, 0)`,
      `insert into public.cancel_events (user_id, booking_id) values ('${guestA}', '${bookingA1}')`,
      `insert into public.stripe_events (event_id, type, payload) values ('evt', 't', '{}')`,
      `insert into public.monthly_statements (host_id, month, gross, platform_fee_excl_tax, platform_fee_tax, stripe_fee, net) values ('${host1}', '2026-01-01', 0, 0, 0, 0, 0)`,
      `insert into public.host_members (host_id, user_id) values ('${host1}', '${guestA}')`,
    ];
    for (const actor of [user(guestA), user(h1), anon]) {
      for (const sql of writes) {
        await as(actor, async (c) => {
          await expectPgError(c.query(sql), '42501');
        });
      }
    }
  });

  it('2段階認証（aal2）のない admin は運営用のデータを読めない', async () => {
    await as(user(admin, 'aal1'), async (c) => {
      expect((await c.query('select 1 from public.audit_logs')).rows).toEqual([]);
      expect(
        (await c.query('select id from public.bookings where id = $1', [bookingB2])).rows,
      ).toEqual([]);
    });
    await as(user(admin, 'aal2'), async (c) => {
      expect((await c.query('select 1 from public.audit_logs')).rows.length).toBeGreaterThan(0);
      expect(
        (await c.query('select id from public.bookings where id = $1', [bookingB2])).rows,
      ).toHaveLength(1);
      expect(
        (await c.query('select id from public.identity_documents where id = $1', [docB])).rows,
      ).toHaveLength(1);
    });
  });

  it('停止中の admin は運営用のデータを読めない', async () => {
    const suspendedAdmin = await createUser({ role: 'admin' });
    await adminPool.query(`update public.profiles set status = 'suspended' where id = $1`, [
      suspendedAdmin,
    ]);
    await as(user(suspendedAdmin, 'aal2'), async (c) => {
      expect((await c.query('select 1 from public.audit_logs')).rows).toEqual([]);
    });
  });

  it('admin ロールは service role（アプリのサーバー）からも付与・剥奪できない', async () => {
    await as(serviceRole, async (c) => {
      await expectPgError(
        c.query(`update public.profiles set role = 'admin' where id = $1`, [guestA]),
        '42501',
        /admin role/,
      );
    });
    await as(serviceRole, async (c) => {
      await expectPgError(
        c.query(`update public.profiles set role = 'guest' where id = $1`, [admin]),
        '42501',
        /admin role/,
      );
    });
    // service role でも guest → host の変更はできる（掲載申込の承認時に使う）
    await as(serviceRole, async (c) => {
      const r = await c.query(`update public.profiles set role = 'host' where id = $1`, [guestB]);
      expect(r.rowCount).toBe(1);
    });
  });

  it('audit_logs は DB に直接接続しても更新・削除できない', async () => {
    await expectPgError(
      adminPool.query(`update public.audit_logs set action = 'x'`),
      '42501',
      /append-only/,
    );
    await expectPgError(adminPool.query(`delete from public.audit_logs`), '42501', /append-only/);
  });
});

describe('公開中のスペース', () => {
  it('未ログインでも公開中・貸出主 active のスペースだけ見える', async () => {
    const draft = await createSpace(host1, { status: 'draft' });
    // 公開中のスペースを持つ貸出主が、あとから停止された場合
    const suspendedHost = await createHost();
    const ofSuspended = await createSpace(suspendedHost);
    await adminPool.query(`update public.hosts set status = 'suspended' where id = $1`, [
      suspendedHost,
    ]);
    await as(anon, async (c) => {
      const r = await c.query('select id from public.spaces where id = any($1)', [
        [space1, space2, draft, ofSuspended],
      ]);
      expect(ids(r.rows)).toEqual([space1, space2].sort());
    });
  });

  it('予約済みの時間帯は期間だけ取得でき、予約の中身は見えない', async () => {
    await as(anon, async (c) => {
      const r = await c.query(
        `select * from public.space_busy_periods($1, now(), now() + interval '30 days')`,
        [space1],
      );
      for (const row of r.rows) expect(Object.keys(row)).toEqual(['period']);
      await expectPgError(c.query('select * from public.bookings'), '42501');
    });
  });
});

describe('予約カゴ', () => {
  it('別の貸出主のスペースは同じカゴに入れられない', async () => {
    await as(user(guestA), async (c) => {
      const cart = await c.query<{ id: string }>(
        `insert into public.carts (guest_id) values ($1) returning id`,
        [guestA],
      );
      const cartId = cart.rows[0]!.id;
      const day = uniqueDay();
      await c.query(
        `insert into public.cart_items (cart_id, space_id, period) values ($1, $2, tstzrange($3, $4, '[)'))`,
        [cartId, space1, `${day}T10:00:00+09:00`, `${day}T11:00:00+09:00`],
      );
      await expectPgError(
        c.query(
          `insert into public.cart_items (cart_id, space_id, period) values ($1, $2, tstzrange($3, $4, '[)'))`,
          [cartId, space2, `${day}T10:00:00+09:00`, `${day}T11:00:00+09:00`],
        ),
        'P0001',
        /cart_host_mismatch/,
      );
    });
  });

  it('他人のカゴや非公開のスペースには追加できない', async () => {
    const cart = await adminPool.query<{ id: string }>(
      `insert into public.carts (guest_id) values ($1) returning id`,
      [guestB],
    );
    const draft = await createSpace(host1, { status: 'draft' });
    const day = uniqueDay();
    await as(user(guestA), async (c) => {
      await expectPgError(
        c.query(
          `insert into public.cart_items (cart_id, space_id, period) values ($1, $2, tstzrange($3, $4, '[)'))`,
          [cart.rows[0]!.id, space1, `${day}T10:00:00+09:00`, `${day}T11:00:00+09:00`],
        ),
        '42501',
      );
    });
    await as(user(guestB), async (c) => {
      await expectPgError(
        c.query(
          `insert into public.cart_items (cart_id, space_id, period) values ($1, $2, tstzrange($3, $4, '[)'))`,
          [cart.rows[0]!.id, draft, `${day}T10:00:00+09:00`, `${day}T11:00:00+09:00`],
        ),
        '42501',
      );
    });
  });
});
