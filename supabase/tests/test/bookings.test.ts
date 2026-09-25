import { describe, expect, it } from 'vitest';
import {
  adminPool,
  apiPool,
  beginAs,
  bookingInsertSql,
  bookingParams,
  createBooking,
  createHost,
  createOrder,
  createSpace,
  createUser,
  expectPgError,
  serviceRole,
  uniqueDay,
  type BookingInput,
} from '../src/db';

async function fixture() {
  const guest = await createUser();
  const other = await createUser();
  const hostId = await createHost();
  const spaceId = await createSpace(hostId);
  const orderA = await createOrder(guest, hostId);
  const orderB = await createOrder(other, hostId);
  const day = uniqueDay();
  const at = (hhmm: string) => `${day}T${hhmm}:00+09:00`;
  const booking = (
    orderId: string,
    guestId: string,
    start: string,
    end: string,
    extra: Partial<BookingInput> = {},
  ) => ({
    orderId,
    spaceId,
    hostId,
    guestId,
    start: at(start),
    end: at(end),
    ...extra,
  });
  return { guest, other, hostId, spaceId, orderA, orderB, at, booking };
}

describe('ダブルブッキングの防止（排他制約）', () => {
  it('重なる時間帯の予約は作れない', async () => {
    const f = await fixture();
    await createBooking(f.booking(f.orderA, f.guest, '10:00', '11:00'));
    await expectPgError(
      createBooking(f.booking(f.orderB, f.other, '10:30', '11:30')),
      '23P01',
      /bookings_no_overlap/,
    );
    await expectPgError(
      createBooking(f.booking(f.orderB, f.other, '09:00', '12:00', { status: 'confirmed' })),
      '23P01',
    );
  });

  it('隣り合う時間帯は予約できる', async () => {
    const f = await fixture();
    await createBooking(f.booking(f.orderA, f.guest, '10:00', '11:00'));
    await createBooking(f.booking(f.orderB, f.other, '11:00', '12:00'));
    await createBooking(f.booking(f.orderB, f.other, '09:30', '10:00'));
  });

  it('キャンセル済み・期限切れの予約の枠は再び予約できる', async () => {
    const f = await fixture();
    const id = await createBooking(f.booking(f.orderA, f.guest, '10:00', '11:00'));
    await adminPool.query(
      `update public.bookings set status = 'cancelled', cancelled_by = 'guest', cancelled_at = now(), cancel_policy = 'full'
       where id = $1`,
      [id],
    );
    await createBooking(f.booking(f.orderB, f.other, '10:00', '11:00'));
  });

  it('同じ時間帯への同時購入は、後から確定した方が DB の制約で失敗する', async () => {
    const f = await fixture();
    const a = await apiPool.connect();
    const b = await apiPool.connect();
    try {
      await beginAs(a, serviceRole);
      await beginAs(b, serviceRole);
      await a.query(
        bookingInsertSql,
        bookingParams(f.booking(f.orderA, f.guest, '13:00', '14:00')),
      );
      // b は a のコミットを待つ（ロック待ち）
      const bInsert = b.query(
        bookingInsertSql,
        bookingParams(f.booking(f.orderB, f.other, '13:30', '14:30')),
      );
      const bResult = bInsert.then(
        () => 'inserted',
        (e: { code?: string }) => e.code,
      );
      await new Promise((r) => setTimeout(r, 200));
      await a.query('commit');
      expect(await bResult).toBe('23P01');
      await b.query('rollback');
    } finally {
      a.release();
      b.release();
    }
    const { rows } = await adminPool.query(
      `select guest_id from public.bookings where space_id = $1`,
      [f.spaceId],
    );
    expect(rows).toEqual([{ guest_id: f.guest }]);
  });

  it('別のスペースなら同じ時間帯でも予約できる', async () => {
    const f = await fixture();
    const space2 = await createSpace(f.hostId);
    await createBooking(f.booking(f.orderA, f.guest, '10:00', '11:00'));
    await createBooking({ ...f.booking(f.orderB, f.other, '10:00', '11:00'), spaceId: space2 });
  });
});

describe('予約の CHECK 制約', () => {
  it('30分刻みでない期間は作れない', async () => {
    const f = await fixture();
    await expectPgError(
      createBooking({ ...f.booking(f.orderA, f.guest, '10:00', '11:00'), start: f.at('10:15') }),
      '23514',
      /bookings_period_valid/,
    );
    await expectPgError(
      createBooking({
        ...f.booking(f.orderA, f.guest, '10:00', '11:00'),
        end: `${f.at('11:00').slice(0, 16)}:01+09:00`,
      }),
      '23514',
    );
  });

  it('枠数・金額が期間と料金に一致しないと作れない', async () => {
    const f = await fixture();
    await expectPgError(
      adminPool.query(
        `insert into public.bookings (order_id, space_id, host_id, guest_id, period, slots, price_per_30min, total)
         values ($1, $2, $3, $4, tstzrange($5, $6, '[)'), 2, 1000, 1500)`,
        [f.orderA, f.spaceId, f.hostId, f.guest, f.at('10:00'), f.at('11:00')],
      ),
      '23514',
      /bookings_total_match/,
    );
    await expectPgError(
      adminPool.query(
        `insert into public.bookings (order_id, space_id, host_id, guest_id, period, slots, price_per_30min, total)
         values ($1, $2, $3, $4, tstzrange($5, $6, '[)'), 3, 1000, 3000)`,
        [f.orderA, f.spaceId, f.hostId, f.guest, f.at('10:00'), f.at('11:00')],
      ),
      '23514',
      /bookings_slots_match/,
    );
  });

  it('注文と利用者・貸出主が一致しない予約は作れない', async () => {
    const f = await fixture();
    await expectPgError(createBooking(f.booking(f.orderA, f.other, '10:00', '11:00')), '23514');
    const otherHost = await createHost();
    const otherSpace = await createSpace(otherHost);
    await expectPgError(
      createBooking({ ...f.booking(f.orderA, f.guest, '10:00', '11:00'), spaceId: otherSpace }),
      '23514',
    );
  });

  it('キャンセルの状態と記録が一致しないと保存できない', async () => {
    const f = await fixture();
    const id = await createBooking(f.booking(f.orderA, f.guest, '10:00', '11:00'));
    await expectPgError(
      adminPool.query(`update public.bookings set status = 'cancelled' where id = $1`, [id]),
      '23514',
    );
    await expectPgError(
      adminPool.query(
        `update public.bookings set status = 'cancelled', cancelled_by = 'host', cancelled_at = now(), cancel_policy = 'full'
         where id = $1`,
        [id],
      ),
      '23514',
      /bookings_host_cancel_reason/,
    );
  });

  it('注文番号は T- から始まる連番', async () => {
    const f = await fixture();
    const { rows } = await adminPool.query(
      `select order_number from public.orders where id = any($1) order by order_number`,
      [[f.orderA, f.orderB]],
    );
    expect(rows[0].order_number).toMatch(/^T-\d{8}$/);
    const [a, b] = rows.map((r) => Number(r.order_number.slice(2)));
    expect(b).toBeGreaterThan(a!);
  });
});

describe('スペースの料金の下限（30分 300 円）', () => {
  it('300 円未満の料金は保存できない', async () => {
    const hostId = await createHost();
    for (const minSlots of [1, 4]) {
      await expectPgError(
        createSpace(hostId, { price: 299, minSlots }),
        '23514',
        /spaces_price_allowed/,
      );
      await createSpace(hostId, { price: 300, minSlots });
    }
  });
});

describe('日をまたぐ予約', () => {
  it('0:00 をまたぐ予約は作れない。24:00 に終わる予約と翌日 0:00 からの予約は別々に作れる', async () => {
    const f = await fixture();
    const day = f.at('00:00').slice(0, 10);
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const base = f.booking(f.orderA, f.guest, '23:00', '23:30');
    await expectPgError(
      createBooking({ ...base, start: `${day}T23:30:00+09:00`, end: `${next}T00:30:00+09:00` }),
      '23514',
      /bookings_single_day/,
    );
    await createBooking({ ...base, start: `${day}T23:00:00+09:00`, end: `${next}T00:00:00+09:00` });
    await createBooking({
      ...base,
      start: `${next}T00:00:00+09:00`,
      end: `${next}T01:00:00+09:00`,
    });
  });

  it('予約カゴにも日をまたぐ期間は入れられない', async () => {
    const guest = await createUser();
    const hostId = await createHost();
    const spaceId = await createSpace(hostId);
    const cart = await adminPool.query<{ id: string }>(
      `insert into public.carts (guest_id) values ($1) returning id`,
      [guest],
    );
    await expectPgError(
      adminPool.query(
        `insert into public.cart_items (cart_id, space_id, period) values ($1, $2, tstzrange($3, $4, '[)'))`,
        [cart.rows[0]!.id, spaceId, '2027-03-01T23:30:00+09:00', '2027-03-02T00:30:00+09:00'],
      ),
      '23514',
      /cart_items_single_day/,
    );
  });
});
