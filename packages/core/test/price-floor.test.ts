import { describe, expect, it } from 'vitest';
import {
  calcBookingFees,
  calcRefundAmounts,
  isHostNetNonNegative,
  isPriceAllowed,
  minPricePer30min,
  PRICING,
} from '../src';

describe('minPricePer30min', () => {
  it('最低利用枠数1なら 237 円', () => {
    // 1枠の半額キャンセル: ceil(237/2)=119 − 110 − ceil(8.532)=9 = 0
    expect(minPricePer30min(1)).toBe(237);
  });

  it('下限ちょうどの料金で半額キャンセルしても貸出主の手取りがマイナスにならない', () => {
    for (let minSlots = 1; minSlots <= PRICING.maxSlotsPerBooking; minSlots++) {
      const floor = minPricePer30min(minSlots);
      for (let slots = minSlots; slots <= PRICING.maxSlotsPerBooking; slots++) {
        const f = calcBookingFees({ pricePer30min: floor, slots });
        const half = calcRefundAmounts('half', {
          total: f.total,
          slots,
          applicationFee: f.applicationFee,
          stripeFeeEstimated: f.stripeFeeEstimated,
        });
        expect(half.hostNet).toBeGreaterThanOrEqual(0);
        expect(half.transferReversalAmount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('下限より1円安い料金は設定できない', () => {
    for (let minSlots = 1; minSlots <= PRICING.maxSlotsPerBooking; minSlots++) {
      const floor = minPricePer30min(minSlots);
      expect(isPriceAllowed(floor, minSlots)).toBe(true);
      expect(isPriceAllowed(floor - 1, minSlots)).toBe(false);
    }
  });

  it('下限以上のすべての料金で設定できる（端数による逆転がない）', () => {
    for (const minSlots of [1, 2, 3, 4]) {
      const floor = minPricePer30min(minSlots);
      for (let p = floor; p <= floor + 3000; p++) expect(isPriceAllowed(p, minSlots)).toBe(true);
    }
  });

  it('最低利用枠数を増やすと下限は下がるか同じ', () => {
    let prev = Infinity;
    for (let minSlots = 1; minSlots <= PRICING.maxSlotsPerBooking; minSlots++) {
      const floor = minPricePer30min(minSlots);
      expect(floor).toBeLessThanOrEqual(prev);
      prev = floor;
    }
  });

  it('端数の影響で 236 円は1枠では手取りがマイナス', () => {
    expect(isHostNetNonNegative(236, 1)).toBe(false);
    expect(isHostNetNonNegative(237, 1)).toBe(true);
  });
});
