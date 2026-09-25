/**
 * 料率・単価・上限などの設定値。お金と時間に関する数値はここに集約する。
 *
 * DB 側（supabase/migrations の `public.pricing_config()`）にも同じ値があり、
 * 両者が一致することを supabase/tests のパリティテストで確認している。
 * ここを変更したらマイグレーションも追加すること。
 */
export const PRICING = {
  /** 1枠の長さ（分） */
  slotMinutes: 30,
  /** 1時間あたりの運営手数料（税抜・円） */
  platformFeePerHourExclTax: 200,
  /** 半額キャンセル時の1時間あたりの運営手数料（税抜・円） */
  halfCancelPlatformFeePerHourExclTax: 100,
  /** 消費税率（%）。運営手数料は税抜額×税率が必ず整数になる単価にしている */
  consumptionTaxRatePercent: 10,
  /** Stripe 決済手数料の見込み料率（万分率）。360 = 3.6% */
  stripeFeeRateBasisPoints: 360,
  /** 1予約あたりの最大枠数（24時間分） */
  maxSlotsPerBooking: 48,
  /**
   * 30分あたりの料金の下限（円）。運営の決定値。
   * 半額キャンセルでも貸出主の手取りがマイナスにならない理論上の下限（price-floor.ts の
   * safePriceFloorPer30min、最大 237 円）以上であることをテストで確認している。
   */
  minPricePer30min: 300,
  /** 30分あたりの料金の上限（円）。入力ミス防止用 */
  maxPricePer30min: 1_000_000,
} as const;

export const BOOKING_RULES = {
  /**
   * 予約を受け付ける期間（日付で判定）。利用日（Asia/Tokyo）が「今日 + この日数」以下なら受け付ける。
   * 日をまたぐ予約は受け付けない（日をまたいで利用したい場合は日ごとに別々に予約する）。
   */
  bookingWindowDays: 30,
  /** 未払いの注文を expired にするまでの時間（分） */
  pendingOrderTtlMinutes: 15,
} as const;

export const CANCEL_RULES = {
  /** これより前のキャンセルは全額返金（利用開始の何時間前か） */
  fullRefundDeadlineHours: 2,
  /** キャンセル回数を数える移動窓（時間） */
  cancelCountWindowHours: 24,
  /** 窓内のキャンセルがこの回数以上あると、次のキャンセルは返金なし */
  cancelCountLimit: 5,
} as const;

export const TIME_ZONE = 'Asia/Tokyo' as const;
/** Asia/Tokyo は夏時間がないため固定オフセットで扱う（+09:00） */
export const TIME_ZONE_OFFSET_MINUTES = 9 * 60;
