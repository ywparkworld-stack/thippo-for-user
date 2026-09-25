import { PRICING } from './config';
import { assertNonNegativeYen, ceilDiv, MoneyError, sumYen, type Yen } from './money';

export function assertSlots(slots: number): void {
  if (!Number.isSafeInteger(slots) || slots < 1 || slots > PRICING.maxSlotsPerBooking) {
    throw new MoneyError(
      `slots must be an integer in 1..${PRICING.maxSlotsPerBooking} (got ${slots})`,
    );
  }
}

export function assertPricePer30min(price: number): void {
  if (!Number.isSafeInteger(price) || price < 1 || price > PRICING.maxPricePer30min) {
    throw new MoneyError(
      `pricePer30min must be an integer in 1..${PRICING.maxPricePer30min} (got ${price})`,
    );
  }
}

/** 手数料計算に使う時間数。30分の端数は1時間に切り上げる。 hours = ceil(slots / 2) */
export function hoursForSlots(slots: number): number {
  assertSlots(slots);
  return ceilDiv(slots * PRICING.slotMinutes, 60);
}

/** 税抜額に対する消費税（運営手数料の単価は税額が整数になるよう設定しているため端数は出ない） */
export function consumptionTax(exclTax: Yen): Yen {
  assertNonNegativeYen(exclTax, 'exclTax');
  const numerator = exclTax * PRICING.consumptionTaxRatePercent;
  if (numerator % 100 !== 0) {
    throw new MoneyError(`consumption tax of ${exclTax} is not an integer`);
  }
  return numerator / 100;
}

/** Stripe 決済手数料の見込み額 = ceil(利用料金 × 3.6%) */
export function estimateStripeFee(amount: Yen): Yen {
  assertNonNegativeYen(amount, 'amount');
  return ceilDiv(amount * PRICING.stripeFeeRateBasisPoints, 10_000);
}

export interface BookingFees {
  slots: number;
  hours: number;
  /** 利用料金（利用者の支払額） */
  total: Yen;
  platformFeeExclTax: Yen;
  platformFeeTax: Yen;
  stripeFeeEstimated: Yen;
  /** = platformFeeExclTax + platformFeeTax + stripeFeeEstimated */
  applicationFee: Yen;
  /** 貸出主への送金額 = total - applicationFee */
  hostTransfer: Yen;
}

/** 予約1件分の料金と手数料の内訳 */
export function calcBookingFees(input: { pricePer30min: Yen; slots: number }): BookingFees {
  assertPricePer30min(input.pricePer30min);
  assertSlots(input.slots);
  const total = input.pricePer30min * input.slots;
  assertNonNegativeYen(total, 'total');
  const hours = hoursForSlots(input.slots);
  const platformFeeExclTax = PRICING.platformFeePerHourExclTax * hours;
  const platformFeeTax = consumptionTax(platformFeeExclTax);
  const stripeFeeEstimated = estimateStripeFee(total);
  const applicationFee = platformFeeExclTax + platformFeeTax + stripeFeeEstimated;
  return {
    slots: input.slots,
    hours,
    total,
    platformFeeExclTax,
    platformFeeTax,
    stripeFeeEstimated,
    applicationFee,
    hostTransfer: total - applicationFee,
  };
}

export interface OrderFees {
  total: Yen;
  applicationFeeAmount: Yen;
  hostTransfer: Yen;
  bookings: BookingFees[];
}

/** 注文（同じ貸出主の予約の集まり）の合計。application_fee_amount は予約ごとの合計 */
export function calcOrderFees(
  bookings: readonly { pricePer30min: Yen; slots: number }[],
): OrderFees {
  if (bookings.length === 0) throw new MoneyError('an order needs at least one booking');
  const items = bookings.map(calcBookingFees);
  const total = sumYen(items.map((b) => b.total));
  const applicationFeeAmount = sumYen(items.map((b) => b.applicationFee));
  return {
    total,
    applicationFeeAmount,
    hostTransfer: total - applicationFeeAmount,
    bookings: items,
  };
}
