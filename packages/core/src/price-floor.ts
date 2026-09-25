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
 * 料金が設定可能か。最低利用枠数 minSlots 以上のすべての枠数（最大 maxSlotsPerBooking）で
 * 貸出主の手取りがマイナスにならないこと。
 */
export function isPriceAllowed(pricePer30min: number, minSlots: number): boolean {
  assertSlots(minSlots);
  if (
    !Number.isSafeInteger(pricePer30min) ||
    pricePer30min < 1 ||
    pricePer30min > PRICING.maxPricePer30min
  ) {
    return false;
  }
  for (let n = minSlots; n <= PRICING.maxSlotsPerBooking; n++) {
    if (!isHostNetNonNegative(pricePer30min, n)) return false;
  }
  return true;
}

/**
 * 30分あたりの料金の下限。この値以上のどの料金でも isPriceAllowed が真になる最小値。
 *
 * 半額キャンセル時の貸出主の手取りは
 *   ceil(total / 2) − 110 × hours − ceil(total × 3.6%)
 * で、切り上げ・切り捨ての影響で料金に対して単調ではないため、
 * 「その料金以上なら常に満たす」最小値を探索で求める。
 * 端数の影響は最大1円なので、手取り ≥ 0.464 × total − 110 × hours − 1 が成り立つ。
 * これが0以上になる料金（最も厳しい n = 1 でも 240 円）より大きい範囲には違反がないため、
 * 探索の上端は十分に余裕を見て 2,000 円にしている。
 */
export function minPricePer30min(minSlots: number): number {
  assertSlots(minSlots);
  const searchUpper = 2_000;
  let lastRejected = 0;
  for (let p = 1; p <= searchUpper; p++) {
    if (!isPriceAllowed(p, minSlots)) lastRejected = p;
  }
  return lastRejected + 1;
}
