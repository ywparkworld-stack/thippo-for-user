import { PRICING } from './config';
import { assertSlots, calcBookingFees } from './fees';
import { calcRefundAmounts } from './refund';

/**
 * 30分あたり price 円・slots 枠の予約で、貸出主の手取りがマイナスにならないか。
 * 通常利用（返金なし）・全額返金・半額返金のすべてで確認する。
 */
export function isHostNetNonNegative(pricePer30min: number, slots: number): boolean {
  const fees = calcBookingFees({ pricePer30min, slots });
  if (fees.hostTransfer < 0) return false;
  const booked = {
    total: fees.total,
    slots,
    applicationFee: fees.applicationFee,
    stripeFeeEstimated: fees.stripeFeeEstimated,
  };
  try {
    return (['none', 'full', 'half'] as const).every(
      (p) => calcRefundAmounts(p, booked).hostNet >= 0,
    );
  } catch {
    return false;
  }
}

/**
 * 料金が設定可能か。
 *   - 30分あたり PRICING.minPricePer30min（300 円）以上、PRICING.maxPricePer30min 以下
 *   - 最低利用枠数 minSlots 以上のすべての枠数（最大 maxSlotsPerBooking）で、
 *     通常利用・全額返金・半額返金のいずれでも貸出主の手取りがマイナスにならない（安全確認）
 */
export function isPriceAllowed(pricePer30min: number, minSlots: number): boolean {
  assertSlots(minSlots);
  if (
    !Number.isSafeInteger(pricePer30min) ||
    pricePer30min < PRICING.minPricePer30min ||
    pricePer30min > PRICING.maxPricePer30min
  ) {
    return false;
  }
  return isHostNetNonNegativeFrom(pricePer30min, minSlots);
}

function isHostNetNonNegativeFrom(pricePer30min: number, minSlots: number): boolean {
  for (let n = minSlots; n <= PRICING.maxSlotsPerBooking; n++) {
    if (!isHostNetNonNegative(pricePer30min, n)) return false;
  }
  return true;
}

/**
 * 半額キャンセルでも貸出主の手取りがマイナスにならない理論上の下限。
 * 運営が決めた下限（PRICING.minPricePer30min）がこれ以上であることの確認に使う。
 *
 * 半額キャンセル時の貸出主の手取りは
 *   ceil(total / 2) − 110 × hours − ceil(total × 3.6%)
 * で、切り上げ・切り捨ての影響で料金に対して単調ではないため、
 * 「その料金以上なら常に満たす」最小値を探索で求める。
 * 端数の影響は最大1円なので、手取り ≥ 0.464 × total − 110 × hours − 1 が成り立つ。
 * これが0以上になる料金（最も厳しい n = 1 でも 240 円）より大きい範囲には違反がないため、
 * 探索の上端は十分に余裕を見て 2,000 円にしている。
 */
export function safePriceFloorPer30min(minSlots: number): number {
  assertSlots(minSlots);
  let lastRejected = 0;
  for (let p = 1; p <= 2_000; p++) {
    if (!isHostNetNonNegativeFrom(p, minSlots)) lastRejected = p;
  }
  return lastRejected + 1;
}
