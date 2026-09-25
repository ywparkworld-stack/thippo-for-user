import {
  BOOKING_RULES,
  calcBookingFees,
  CANCEL_RULES,
  isPriceAllowed,
  jstToUtc,
  lastBookableDate,
  PRICING,
} from '@thippo/core';
import { describe, expect, it } from 'vitest';
import { adminPool } from '../src/db';

// DB 関数（supabase/migrations/20260925000001_pricing.sql）と packages/core が同じ結果になること

describe('pricing_config', () => {
  it('packages/core の設定値と一致する', async () => {
    const { rows } = await adminPool.query('select * from public.pricing_config()');
    expect(rows[0]).toEqual({
      slot_minutes: PRICING.slotMinutes,
      platform_fee_per_hour_excl_tax: PRICING.platformFeePerHourExclTax,
      half_cancel_platform_fee_per_hour_excl_tax: PRICING.halfCancelPlatformFeePerHourExclTax,
      consumption_tax_rate_percent: PRICING.consumptionTaxRatePercent,
      stripe_fee_rate_basis_points: PRICING.stripeFeeRateBasisPoints,
      max_slots_per_booking: PRICING.maxSlotsPerBooking,
      max_price_per_30min: PRICING.maxPricePer30min,
      min_price_per_30min: PRICING.minPricePer30min,
      booking_window_days: BOOKING_RULES.bookingWindowDays,
      pending_order_ttl_minutes: BOOKING_RULES.pendingOrderTtlMinutes,
      full_refund_deadline_hours: CANCEL_RULES.fullRefundDeadlineHours,
      cancel_count_window_hours: CANCEL_RULES.cancelCountWindowHours,
      cancel_count_limit: CANCEL_RULES.cancelCountLimit,
    });
  });
});

describe('calc_booking_fees', () => {
  it('さまざまな料金・枠数で packages/core と一致する', async () => {
    const prices = [237, 500, 777, 1000, 1250, 3333, 9999, 1_000_000];
    const { rows } = await adminPool.query(
      `select p.price, s.slots, f.*
       from unnest($1::int[]) as p(price)
       cross join generate_series(1, 48) as s(slots)
       cross join lateral public.calc_booking_fees(p.price, s.slots) f`,
      [prices],
    );
    expect(rows).toHaveLength(prices.length * 48);
    for (const r of rows) {
      const f = calcBookingFees({ pricePer30min: r.price, slots: r.slots });
      expect(r).toEqual({
        price: r.price,
        slots: r.slots,
        hours: f.hours,
        total: f.total,
        platform_fee_excl_tax: f.platformFeeExclTax,
        platform_fee_tax: f.platformFeeTax,
        stripe_fee_estimated: f.stripeFeeEstimated,
        application_fee: f.applicationFee,
        host_transfer: f.hostTransfer,
      });
    }
  });

  it('不正な入力はエラー', async () => {
    await expect(
      adminPool.query('select * from public.calc_booking_fees(1000, 0)'),
    ).rejects.toThrow();
    await expect(adminPool.query('select * from public.calc_booking_fees(0, 1)')).rejects.toThrow();
  });
});

describe('is_price_allowed', () => {
  it('下限（300 円）や理論上の下限（237 円）の前後で packages/core と一致する', async () => {
    const cases: [number, number][] = [];
    for (let minSlots = 1; minSlots <= 48; minSlots++) {
      for (const p of [
        1, 100, 230, 236, 237, 238, 295, 298, 299, 300, 301, 302, 1000, 1_000_000, 1_000_001,
      ]) {
        cases.push([p, minSlots]);
      }
    }
    const { rows } = await adminPool.query<{ price: number; min_slots: number; allowed: boolean }>(
      `select c.price, c.min_slots, public.is_price_allowed(c.price, c.min_slots) as allowed
       from unnest($1::int[], $2::int[]) as c(price, min_slots)`,
      [cases.map((c) => c[0]), cases.map((c) => c[1])],
    );
    expect(rows).toHaveLength(cases.length);
    for (const r of rows) expect(r.allowed).toBe(isPriceAllowed(r.price, r.min_slots));
  });
});

describe('last_bookable_date', () => {
  it('packages/core と一致する（Asia/Tokyo の日付で判定）', async () => {
    const nows = [
      jstToUtc('2026-09-25', '00:00'),
      jstToUtc('2026-09-25', '08:59'),
      jstToUtc('2026-09-25', '09:00'),
      jstToUtc('2026-09-25', '23:59'),
      jstToUtc('2026-12-31', '23:30'),
      jstToUtc('2028-02-15', '12:00'),
    ];
    for (const now of nows) {
      const { rows } = await adminPool.query(`select public.last_bookable_date($1)::text as d`, [
        now.toISOString(),
      ]);
      expect(rows[0].d).toBe(lastBookableDate(now));
    }
  });
});
