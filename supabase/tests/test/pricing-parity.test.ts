import {
  BOOKING_RULES,
  calcBookingFees,
  CANCEL_RULES,
  isPriceAllowed,
  minPricePer30min,
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

describe('is_price_allowed / min_price_per_30min', () => {
  it('下限の前後で packages/core と一致する', async () => {
    const cases: [number, number][] = [];
    for (let minSlots = 1; minSlots <= 48; minSlots++) {
      const floor = minPricePer30min(minSlots);
      for (let p = Math.max(1, floor - 5); p <= floor + 5; p++) cases.push([p, minSlots]);
    }
    const { rows } = await adminPool.query<{ price: number; min_slots: number; allowed: boolean }>(
      `select c.price, c.min_slots, public.is_price_allowed(c.price, c.min_slots) as allowed
       from unnest($1::int[], $2::int[]) as c(price, min_slots)`,
      [cases.map((c) => c[0]), cases.map((c) => c[1])],
    );
    for (const r of rows) expect(r.allowed).toBe(isPriceAllowed(r.price, r.min_slots));
  });

  it('下限の値が一致する', async () => {
    for (const minSlots of [1, 2, 3, 4, 48]) {
      const { rows } = await adminPool.query('select public.min_price_per_30min($1) as v', [
        minSlots,
      ]);
      expect(rows[0].v).toBe(minPricePer30min(minSlots));
    }
  });
});
