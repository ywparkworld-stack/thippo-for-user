import { describe, expect, it } from 'vitest';
import {
  calcBookingFees,
  calcRefundAmounts,
  isHostNetNonNegative,
  isPriceAllowed,
  PRICING,
  safePriceFloorPer30min,
} from '../src';

describe('料金の下限（30分 300 円）', () => {
  it('下限は 300 円', () => {
    expect(PRICING.minPricePer30min).toBe(300);
  });

  it('最低利用枠数に関係なく、300 円は設定でき 299 円は設定できない', () => {
    for (let minSlots = 1; minSlots <= PRICING.maxSlotsPerBooking; minSlots++) {
      expect(isPriceAllowed(300, minSlots)).toBe(true);
      expect(isPriceAllowed(299, minSlots)).toBe(false);
    }
  });

  it('下限ちょうどの料金で半額キャンセルしても貸出主の手取りがマイナスにならない', () => {
    for (let slots = 1; slots <= PRICING.maxSlotsPerBooking; slots++) {
      const f = calcBookingFees({ pricePer30min: 300, slots });
      const booked = {
        total: f.total,
        slots,
        applicationFee: f.applicationFee,
        stripeFeeEstimated: f.stripeFeeEstimated,
      };
      const half = calcRefundAmounts('half', booked);
      expect(half.hostNet).toBeGreaterThanOrEqual(0);
      expect(half.transferReversalAmount).toBeGreaterThanOrEqual(0);
      expect(calcRefundAmounts('none', booked).hostNet).toBeGreaterThanOrEqual(0);
      expect(calcRefundAmounts('full', booked).hostNet).toBe(0);
    }
    // 1枠の半額キャンセル: 300 − 150 − 110 − ceil(10.8)=11 = 29
    const f = calcBookingFees({ pricePer30min: 300, slots: 1 });
    expect(
      calcRefundAmounts('half', {
        total: f.total,
        slots: 1,
        applicationFee: f.applicationFee,
        stripeFeeEstimated: f.stripeFeeEstimated,
      }).hostNet,
    ).toBe(29);
  });

  it('下限以上のすべての料金で設定できる（端数による逆転がない）', () => {
    for (const minSlots of [1, 2, 3, 4]) {
      for (let p = 300; p <= 5_000; p++) expect(isPriceAllowed(p, minSlots)).toBe(true);
    }
    expect(isPriceAllowed(PRICING.maxPricePer30min, 1)).toBe(true);
    expect(isPriceAllowed(PRICING.maxPricePer30min + 1, 1)).toBe(false);
  });
});

describe('safePriceFloorPer30min（手取りがマイナスにならない理論上の下限）', () => {
  it('最低利用枠数1なら 237 円', () => {
    // 1枠の半額キャンセル: ceil(237/2)=119 − 110 − ceil(8.532)=9 = 0
    expect(safePriceFloorPer30min(1)).toBe(237);
    expect(isHostNetNonNegative(236, 1)).toBe(false);
    expect(isHostNetNonNegative(237, 1)).toBe(true);
  });

  it('運営が決めた下限（300 円）はどの最低利用枠数でも理論上の下限以上', () => {
    for (let minSlots = 1; minSlots <= PRICING.maxSlotsPerBooking; minSlots++) {
      expect(safePriceFloorPer30min(minSlots)).toBeLessThanOrEqual(PRICING.minPricePer30min);
    }
  });
});
