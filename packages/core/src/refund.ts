import { CANCEL_RULES, PRICING } from './config';
import { consumptionTax, hoursForSlots } from './fees';
import { assertNonNegativeYen, floorDiv, MoneyError, type Yen } from './money';

export type CancelActor = 'guest' | 'host' | 'admin';
export type CancelPolicy = 'full' | 'half' | 'none';
export type CancelReason =
  /** 貸出主・運営によるキャンセル（常に全額返金） */
  | 'by_host_or_admin'
  /** now >= start */
  | 'after_start'
  /** 過去24時間の利用者自身のキャンセルがすでに上限回数以上 */
  | 'cancel_limit'
  /** now < start - 2時間 */
  | 'before_deadline'
  /** start - 2時間 <= now < start */
  | 'within_deadline';

export interface CancelDecisionInput {
  actor: CancelActor;
  now: Date;
  start: Date;
  /**
   * now から遡って24時間以内の、この利用者自身のキャンセル回数（今回の分は含まない）。
   * 貸出主・運営のキャンセルと no_show は含めない。
   */
  recentGuestCancelCount: number;
}

function assertValidDate(d: Date, label: string): void {
  if (!(d instanceof Date) || Number.isNaN(d.getTime()))
    throw new MoneyError(`${label} must be a valid Date`);
}

/** SPEC 8 の表を上から順に判定する */
export function decideCancelPolicy(input: CancelDecisionInput): {
  policy: CancelPolicy;
  reason: CancelReason;
} {
  assertValidDate(input.now, 'now');
  assertValidDate(input.start, 'start');
  if (!Number.isSafeInteger(input.recentGuestCancelCount) || input.recentGuestCancelCount < 0) {
    throw new MoneyError('recentGuestCancelCount must be a non-negative integer');
  }
  if (input.actor === 'host' || input.actor === 'admin') {
    return { policy: 'full', reason: 'by_host_or_admin' };
  }
  const now = input.now.getTime();
  const start = input.start.getTime();
  if (now >= start) return { policy: 'none', reason: 'after_start' };
  if (input.recentGuestCancelCount >= CANCEL_RULES.cancelCountLimit) {
    return { policy: 'none', reason: 'cancel_limit' };
  }
  const deadline = start - CANCEL_RULES.fullRefundDeadlineHours * 60 * 60 * 1000;
  if (now < deadline) return { policy: 'full', reason: 'before_deadline' };
  return { policy: 'half', reason: 'within_deadline' };
}

/** 確定時に保存した予約1件分の金額（booking_fees と bookings.total） */
export interface BookedAmounts {
  total: Yen;
  slots: number;
  applicationFee: Yen;
  stripeFeeEstimated: Yen;
}

export interface RefundAmounts {
  policy: CancelPolicy;
  /** 利用者への返金額（refunds.create の amount） */
  refundAmount: Yen;
  /** 貸出主からの差し戻し額（transfers.createReversal の amount） */
  transferReversalAmount: Yen;
  /** キャンセル後に運営が受け取る運営手数料（税抜） */
  platformFeeExclTax: Yen;
  /** キャンセル後に運営が受け取る運営手数料の消費税 */
  platformFeeTax: Yen;
  /** Stripe 決済手数料の負担者 */
  stripeFeeBorneBy: 'host' | 'platform';
  /** 貸出主の最終的な手取り（送金額 − 差し戻し額） */
  hostNet: Yen;
  /**
   * 運営の最終的な手取り（Stripe 手数料は見込み額で計算）。
   * 実額との差は運営が吸収するため、実際の手取りは (stripeFeeEstimated - 実額) だけずれる。
   */
  platformNetEstimated: Yen;
  /** Stripe の返金・差し戻し処理が必要か（返金額0円なら不要） */
  requiresStripe: boolean;
}

/** SPEC 8 / 8.1 に基づく返金額と差し戻し額 */
export function calcRefundAmounts(policy: CancelPolicy, booked: BookedAmounts): RefundAmounts {
  assertNonNegativeYen(booked.total, 'total');
  assertNonNegativeYen(booked.applicationFee, 'applicationFee');
  assertNonNegativeYen(booked.stripeFeeEstimated, 'stripeFeeEstimated');
  const hours = hoursForSlots(booked.slots);
  const hostTransfer = booked.total - booked.applicationFee;
  if (hostTransfer < 0) throw new MoneyError('applicationFee exceeds total');

  let refundAmount: Yen;
  let transferReversalAmount: Yen;
  let platformFeeExclTax: Yen;
  switch (policy) {
    case 'none':
      refundAmount = 0;
      transferReversalAmount = 0;
      platformFeeExclTax = PRICING.platformFeePerHourExclTax * hours;
      break;
    case 'full':
      refundAmount = booked.total;
      transferReversalAmount = hostTransfer;
      platformFeeExclTax = 0;
      break;
    case 'half': {
      refundAmount = floorDiv(booked.total, 2);
      platformFeeExclTax = PRICING.halfCancelPlatformFeePerHourExclTax * hours;
      const fee = platformFeeExclTax + consumptionTax(platformFeeExclTax);
      transferReversalAmount = refundAmount - fee;
      break;
    }
  }
  const platformFeeTax = consumptionTax(platformFeeExclTax);
  if (transferReversalAmount < 0 || transferReversalAmount > hostTransfer) {
    // 料金の下限（price-floor.ts）を守っていれば起こらない
    throw new MoneyError(
      `transfer reversal ${transferReversalAmount} is out of range 0..${hostTransfer} (policy=${policy})`,
    );
  }
  const hostNet = hostTransfer - transferReversalAmount;
  const platformNetEstimated =
    booked.applicationFee + transferReversalAmount - refundAmount - booked.stripeFeeEstimated;
  return {
    policy,
    refundAmount,
    transferReversalAmount,
    platformFeeExclTax,
    platformFeeTax,
    stripeFeeBorneBy: policy === 'full' ? 'platform' : 'host',
    hostNet,
    platformNetEstimated,
    requiresStripe: refundAmount > 0,
  };
}

export function calcCancellation(input: CancelDecisionInput & { booked: BookedAmounts }) {
  const decision = decideCancelPolicy(input);
  return { ...decision, ...calcRefundAmounts(decision.policy, input.booked) };
}

/** キャンセル画面に表示する注意書き。countBefore は今回を含まない過去24時間の回数 */
export function cancelCountNotice(countBefore: number): string {
  return `過去${CANCEL_RULES.cancelCountWindowHours}時間で${countBefore + 1}回目のキャンセルです。${
    CANCEL_RULES.cancelCountLimit + 1
  }回目以降は返金されません`;
}
