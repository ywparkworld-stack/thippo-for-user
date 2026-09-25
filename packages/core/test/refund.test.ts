import { describe, expect, it } from 'vitest';
import {
  calcBookingFees,
  calcCancellation,
  calcRefundAmounts,
  cancelCountNotice,
  decideCancelPolicy,
  jstToUtc,
  type BookedAmounts,
} from '../src';

const start = jstToUtc('2026-10-01', '10:00');
const ms = (h: number) => h * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(start.getTime() + offsetMs);

describe('decideCancelPolicy（利用者）', () => {
  const guest = (now: Date, recentGuestCancelCount = 0) =>
    decideCancelPolicy({ actor: 'guest', now, start, recentGuestCancelCount });

  it('start − 2時間より前は全額', () => {
    expect(guest(at(-ms(2) - 1))).toEqual({ policy: 'full', reason: 'before_deadline' });
    expect(guest(at(-ms(48)))).toEqual({ policy: 'full', reason: 'before_deadline' });
  });

  it('start − 2時間ちょうどは半額', () => {
    expect(guest(at(-ms(2)))).toEqual({ policy: 'half', reason: 'within_deadline' });
  });

  it('start の直前は半額', () => {
    expect(guest(at(-1))).toEqual({ policy: 'half', reason: 'within_deadline' });
  });

  it('start ちょうどは返金なし', () => {
    expect(guest(at(0))).toEqual({ policy: 'none', reason: 'after_start' });
    expect(guest(at(ms(1)))).toEqual({ policy: 'none', reason: 'after_start' });
  });

  it('過去24時間のキャンセルが4回なら通常どおり判定', () => {
    expect(guest(at(-ms(24)), 4)).toEqual({ policy: 'full', reason: 'before_deadline' });
    expect(guest(at(-ms(1)), 4)).toEqual({ policy: 'half', reason: 'within_deadline' });
  });

  it('過去24時間のキャンセルが5回以上なら返金なし', () => {
    expect(guest(at(-ms(24)), 5)).toEqual({ policy: 'none', reason: 'cancel_limit' });
    expect(guest(at(-ms(1)), 6)).toEqual({ policy: 'none', reason: 'cancel_limit' });
  });

  it('利用開始後の判定がキャンセル回数より優先される', () => {
    expect(guest(at(0), 5)).toEqual({ policy: 'none', reason: 'after_start' });
  });
});

describe('decideCancelPolicy（貸出主・運営）', () => {
  it.each(['host', 'admin'] as const)('%s は常に全額', (actor) => {
    for (const now of [at(-ms(48)), at(-ms(1)), at(0), at(ms(1))]) {
      expect(decideCancelPolicy({ actor, now, start, recentGuestCancelCount: 10 })).toEqual({
        policy: 'full',
        reason: 'by_host_or_admin',
      });
    }
  });
});

describe('calcRefundAmounts（30分 1,000 円 × 3枠 = 3,000 円、2時間分）', () => {
  const fees = calcBookingFees({ pricePer30min: 1000, slots: 3 });
  const booked: BookedAmounts = {
    total: fees.total,
    slots: 3,
    applicationFee: fees.applicationFee,
    stripeFeeEstimated: fees.stripeFeeEstimated,
  };
  // total 3000, application fee 548 (= 400 + 40 + 108), 貸出主への送金 2452

  it('全額返金: 貸出主の手取り0、運営は Stripe 手数料を負担', () => {
    const r = calcRefundAmounts('full', booked);
    expect(r.refundAmount).toBe(3000);
    expect(r.transferReversalAmount).toBe(3000 - 548); // 利用料金 − application fee
    expect(r.hostNet).toBe(0);
    expect(r.platformFeeExclTax).toBe(0);
    expect(r.platformFeeTax).toBe(0);
    expect(r.stripeFeeBorneBy).toBe('platform');
    expect(r.platformNetEstimated).toBe(-108);
    expect(r.requiresStripe).toBe(true);
  });

  it('半額返金: 運営は1時間110円、貸出主は Stripe 手数料を負担', () => {
    const r = calcRefundAmounts('half', booked);
    expect(r.refundAmount).toBe(1500);
    expect(r.transferReversalAmount).toBe(1500 - 110 * 2);
    expect(r.platformFeeExclTax).toBe(200);
    expect(r.platformFeeTax).toBe(20);
    expect(r.platformNetEstimated).toBe(110 * 2);
    // 貸出主の手取り = (利用料金 − 返金額) − 110 × hours − Stripe 手数料
    expect(r.hostNet).toBe(3000 - 1500 - 220 - 108);
    expect(r.stripeFeeBorneBy).toBe('host');
  });

  it('返金なし: 運営は1時間220円、Stripe の処理は不要', () => {
    const r = calcRefundAmounts('none', booked);
    expect(r.refundAmount).toBe(0);
    expect(r.transferReversalAmount).toBe(0);
    expect(r.platformFeeExclTax).toBe(400);
    expect(r.platformFeeTax).toBe(40);
    expect(r.platformNetEstimated).toBe(220 * 2);
    expect(r.hostNet).toBe(3000 - 548);
    expect(r.requiresStripe).toBe(false);
  });

  it('半額の1円未満は切り捨て', () => {
    const f = calcBookingFees({ pricePer30min: 777, slots: 1 });
    const r = calcRefundAmounts('half', {
      total: f.total,
      slots: 1,
      applicationFee: f.applicationFee,
      stripeFeeEstimated: f.stripeFeeEstimated,
    });
    expect(r.refundAmount).toBe(388);
    expect(r.transferReversalAmount).toBe(388 - 110);
    expect(r.hostNet).toBe(777 - 388 - 110 - 28);
  });

  it('どの方針でも お金の出入りの合計 = 利用者の支払額 − 返金額 − Stripe 手数料', () => {
    for (const policy of ['full', 'half', 'none'] as const) {
      const r = calcRefundAmounts(policy, booked);
      expect(r.hostNet + r.platformNetEstimated).toBe(
        booked.total - r.refundAmount - booked.stripeFeeEstimated,
      );
    }
  });
});

describe('複数予約の注文の一部をキャンセルした場合', () => {
  it('差し戻し額はその予約の金額だけで決まる（比例配分しない）', () => {
    const a = calcBookingFees({ pricePer30min: 1000, slots: 2 });
    const b = calcBookingFees({ pricePer30min: 3000, slots: 5 });
    const rA = calcRefundAmounts('full', {
      total: a.total,
      slots: 2,
      applicationFee: a.applicationFee,
      stripeFeeEstimated: a.stripeFeeEstimated,
    });
    expect(rA.transferReversalAmount).toBe(a.total - a.applicationFee);
    expect(rA.transferReversalAmount).toBeLessThan(a.hostTransfer + b.hostTransfer);
  });
});

describe('calcCancellation', () => {
  it('判定と金額をまとめて返す', () => {
    const f = calcBookingFees({ pricePer30min: 1000, slots: 2 });
    const r = calcCancellation({
      actor: 'guest',
      now: at(-ms(1)),
      start,
      recentGuestCancelCount: 0,
      booked: {
        total: f.total,
        slots: 2,
        applicationFee: f.applicationFee,
        stripeFeeEstimated: f.stripeFeeEstimated,
      },
    });
    expect(r.policy).toBe('half');
    expect(r.reason).toBe('within_deadline');
    expect(r.refundAmount).toBe(1000);
  });
});

describe('cancelCountNotice', () => {
  it('今回が何回目かを表示する', () => {
    expect(cancelCountNotice(0)).toBe(
      '過去24時間で1回目のキャンセルです。6回目以降は返金されません',
    );
    expect(cancelCountNotice(5)).toBe(
      '過去24時間で6回目のキャンセルです。6回目以降は返金されません',
    );
  });
});
