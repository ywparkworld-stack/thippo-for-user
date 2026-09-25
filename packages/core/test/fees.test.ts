import { describe, expect, it } from 'vitest';
import {
  calcBookingFees,
  calcOrderFees,
  estimateStripeFee,
  hoursForSlots,
  MoneyError,
} from '../src';

describe('hoursForSlots', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [48, 24],
  ])('%i 枠 → %i 時間', (slots, hours) => {
    expect(hoursForSlots(slots)).toBe(hours);
  });

  it('枠数が不正なら例外', () => {
    for (const bad of [0, -1, 1.5, 49, Number.NaN])
      expect(() => hoursForSlots(bad)).toThrow(MoneyError);
  });
});

describe('estimateStripeFee', () => {
  it('ceil(利用料金 × 3.6%)', () => {
    expect(estimateStripeFee(1000)).toBe(36);
    expect(estimateStripeFee(777)).toBe(28); // 27.972 → 28
    expect(estimateStripeFee(2500)).toBe(90); // ちょうど割り切れる
    expect(estimateStripeFee(1)).toBe(1);
    expect(estimateStripeFee(0)).toBe(0);
  });

  it('割り切れる金額では切り上げない（整数演算のみで計算している）', () => {
    for (let amount = 0; amount <= 100_000; amount += 250) {
      expect(estimateStripeFee(amount)).toBe((amount * 360) / 10_000);
    }
  });
});

describe('calcBookingFees（30分あたり 1,000 円）', () => {
  it.each([
    // minutes, slots, hours, total, excl, tax, stripe, app
    [30, 1, 1, 1000, 200, 20, 36, 256],
    [60, 2, 1, 2000, 200, 20, 72, 292],
    [90, 3, 2, 3000, 400, 40, 108, 548],
    [120, 4, 2, 4000, 400, 40, 144, 584],
  ])('%i 分', (_min, slots, hours, total, excl, tax, stripe, app) => {
    const f = calcBookingFees({ pricePer30min: 1000, slots });
    expect(f).toEqual({
      slots,
      hours,
      total,
      platformFeeExclTax: excl,
      platformFeeTax: tax,
      stripeFeeEstimated: stripe,
      applicationFee: app,
      hostTransfer: total - app,
    });
    expect(f.applicationFee).toBe(f.platformFeeExclTax + f.platformFeeTax + f.stripeFeeEstimated);
    expect(f.platformFeeExclTax + f.platformFeeTax).toBe(220 * hours);
  });

  it('料金が不正なら例外', () => {
    for (const bad of [0, -100, 100.5, 1_000_001]) {
      expect(() => calcBookingFees({ pricePer30min: bad, slots: 1 })).toThrow(MoneyError);
    }
  });
});

describe('calcOrderFees', () => {
  it('application_fee_amount は予約ごとの application fee の合計と一致する', () => {
    const items = [
      { pricePer30min: 1000, slots: 1 },
      { pricePer30min: 777, slots: 3 },
      { pricePer30min: 1250, slots: 4 },
    ];
    const order = calcOrderFees(items);
    const each = items.map(calcBookingFees);
    expect(order.applicationFeeAmount).toBe(each.reduce((s, b) => s + b.applicationFee, 0));
    expect(order.total).toBe(1000 + 777 * 3 + 1250 * 4);
    expect(order.hostTransfer).toBe(order.total - order.applicationFeeAmount);
    // 注文全体でまとめて計算した値とは一致しないことがある（予約ごとに切り上げるため）
    expect(order.bookings).toEqual(each);
  });

  it('予約が0件なら例外', () => {
    expect(() => calcOrderFees([])).toThrow(MoneyError);
  });
});
