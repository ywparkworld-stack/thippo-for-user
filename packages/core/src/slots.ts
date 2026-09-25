import { BOOKING_RULES, PRICING } from './config';
import {
  addDaysJst,
  isSlotAligned,
  jstToUtc,
  parseJstTimeToMinutes,
  SLOT_MS,
  toJstParts,
  weekdayOf,
  type JstDate,
  type JstTime,
} from './time';

export interface AvailabilityRule {
  /** 0 = 日曜 … 6 = 土曜 */
  weekday: number;
  openTime: JstTime;
  closeTime: JstTime;
}

export interface Period {
  start: Date;
  /** 終了（この時刻は含まない） */
  end: Date;
}

export type SlotStatus =
  /** 予約できる */
  | 'available'
  /** 他の予約（pending / confirmed）と重なっている */
  | 'booked'
  /** 開始時刻を過ぎている */
  | 'past'
  /** 予約受付期間（今日から30日後の日付まで）より先 */
  | 'out_of_window';

export interface Slot extends Period {
  status: SlotStatus;
}

export function overlaps(a: Period, b: Period): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function slotCount(period: Period): number {
  return (period.end.getTime() - period.start.getTime()) / SLOT_MS;
}

/** 予約を受け付ける最後の利用日（Asia/Tokyo）。今日 + bookingWindowDays 日 */
export function lastBookableDate(now: Date): JstDate {
  return addDaysJst(toJstParts(now).date, BOOKING_RULES.bookingWindowDays);
}

/** 利用日（Asia/Tokyo）が予約受付期間内か */
export function isWithinBookingWindow(date: JstDate, now: Date): boolean {
  return date <= lastBookableDate(now);
}

/** 期間が1つの暦日（Asia/Tokyo）に収まっているか。24:00 ちょうどに終わるのは同じ日とみなす */
export function isSingleJstDay(period: Period): boolean {
  if (period.end <= period.start) return false;
  const startDate = toJstParts(period.start).date;
  return period.end.getTime() <= jstToUtc(startDate, '24:00').getTime();
}

/** 営業時間の1件が正しいか（30分刻み、開始 < 終了） */
export function isValidAvailabilityRule(rule: AvailabilityRule): boolean {
  if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) return false;
  try {
    const open = parseJstTimeToMinutes(rule.openTime);
    const close = parseJstTimeToMinutes(rule.closeTime);
    return open < close && open % PRICING.slotMinutes === 0 && close % PRICING.slotMinutes === 0;
  } catch {
    return false;
  }
}

export interface DaySlotsInput {
  date: JstDate;
  rules: readonly AvailabilityRule[];
  /** 休業日（YYYY-MM-DD） */
  closures: readonly JstDate[];
  /** pending / confirmed の予約が入っている期間 */
  busy: readonly Period[];
  now: Date;
}

/**
 * 指定日（Asia/Tokyo）の30分枠の一覧。営業時間外と休業日の枠は含めない。
 * 同じ曜日に複数の営業時間があってもよい（重複する枠は1つにまとめる）。
 */
export function buildDaySlots(input: DaySlotsInput): Slot[] {
  if (input.closures.includes(input.date)) return [];
  const weekday = weekdayOf(input.date);
  const starts = new Set<number>();
  for (const rule of input.rules) {
    if (rule.weekday !== weekday || !isValidAvailabilityRule(rule)) continue;
    const open = jstToUtc(input.date, rule.openTime).getTime();
    const close = jstToUtc(input.date, rule.closeTime).getTime();
    for (let t = open; t < close; t += SLOT_MS) starts.add(t);
  }
  const now = input.now.getTime();
  const inWindow = isWithinBookingWindow(input.date, input.now);
  return [...starts]
    .sort((a, b) => a - b)
    .map((t) => {
      const slot: Period = { start: new Date(t), end: new Date(t + SLOT_MS) };
      let status: SlotStatus = 'available';
      if (t <= now) status = 'past';
      else if (!inWindow) status = 'out_of_window';
      else if (input.busy.some((b) => overlaps(slot, b))) status = 'booked';
      return { ...slot, status };
    });
}

export type SelectionError =
  | 'invalid_range'
  | 'crosses_day'
  | 'not_contiguous'
  | 'unavailable'
  | 'below_min_slots'
  | 'above_max_slots';

export type SelectionResult =
  { ok: true; period: Period; slots: number } | { ok: false; error: SelectionError };

/** 開始枠と終了枠（どちらも含む）を選んだときの予約期間 */
export function selectRange(
  slots: readonly Slot[],
  startIndex: number,
  endIndex: number,
  minSlots: number,
): SelectionResult {
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  const first = slots[from];
  const last = slots[to];
  if (!first || !last || from < 0) return { ok: false, error: 'invalid_range' };
  for (let i = from; i <= to; i++) {
    const s = slots[i]!;
    if (s.status !== 'available') return { ok: false, error: 'unavailable' };
    if (i > from && slots[i - 1]!.end.getTime() !== s.start.getTime()) {
      return { ok: false, error: 'not_contiguous' };
    }
  }
  const count = to - from + 1;
  if (count < minSlots) return { ok: false, error: 'below_min_slots' };
  if (count > PRICING.maxSlotsPerBooking) return { ok: false, error: 'above_max_slots' };
  return { ok: true, period: { start: first.start, end: last.end }, slots: count };
}

/**
 * サーバー側での再確認用。期間が30分刻みで、開始日（Asia/Tokyo）の営業時間内の
 * 予約可能な枠だけで構成されているかを確認する。日をまたぐ予約は受け付けない
 * （日をまたいで利用したい場合は日ごとに別々に予約する）。
 */
export function validateBookingPeriod(
  period: Period,
  input: Omit<DaySlotsInput, 'date'> & { minSlots: number },
): SelectionResult {
  if (!isSlotAligned(period.start) || !isSlotAligned(period.end) || period.end <= period.start) {
    return { ok: false, error: 'invalid_range' };
  }
  if (!isSingleJstDay(period)) return { ok: false, error: 'crosses_day' };
  const slots = buildDaySlots({ ...input, date: toJstParts(period.start).date });
  const from = slots.findIndex((s) => s.start.getTime() === period.start.getTime());
  const to = slots.findIndex((s) => s.end.getTime() === period.end.getTime());
  if (from < 0 || to < 0 || to < from) return { ok: false, error: 'unavailable' };
  return selectRange(slots, from, to, input.minSlots);
}
