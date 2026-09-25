import { PRICING, TIME_ZONE_OFFSET_MINUTES } from './config';

/** YYYY-MM-DD（Asia/Tokyo の暦日） */
export type JstDate = string;
/** HH:MM または HH:MM:SS（Asia/Tokyo の時刻）。営業終了の 24:00 を許可する */
export type JstTime = string;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const OFFSET_MS = TIME_ZONE_OFFSET_MINUTES * MINUTE_MS;
export const SLOT_MS = PRICING.slotMinutes * MINUTE_MS;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export class TimeError extends Error {
  override name = 'TimeError';
}

export function parseJstDate(date: JstDate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new TimeError(`invalid date: ${date}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new TimeError(`invalid date: ${date}`);
  }
  return { year, month, day };
}

/** 時刻を 0:00 からの分に変換する（24:00 は 1440） */
export function parseJstTimeToMinutes(time: JstTime): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new TimeError(`invalid time: ${time}`);
  const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? '0')];
  if (min > 59 || sec !== 0) throw new TimeError(`invalid time: ${time}`);
  const total = h * 60 + min;
  if (total > 24 * 60) throw new TimeError(`invalid time: ${time}`);
  return total;
}

/** Asia/Tokyo の日付・時刻を UTC の Date に変換する */
export function jstToUtc(date: JstDate, time: JstTime = '00:00'): Date {
  const { year, month, day } = parseJstDate(date);
  const minutes = parseJstTimeToMinutes(time);
  return new Date(Date.UTC(year, month - 1, day) + minutes * MINUTE_MS - OFFSET_MS);
}

export interface JstParts {
  date: JstDate;
  /** HH:MM */
  time: string;
  /** 0 = 日曜 … 6 = 土曜（PostgreSQL の extract(dow) と同じ） */
  weekday: number;
}

export function toJstParts(d: Date): JstParts {
  const shifted = new Date(d.getTime() + OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    weekday: shifted.getUTCDay(),
  };
}

export function weekdayOf(date: JstDate): number {
  return toJstParts(jstToUtc(date)).weekday;
}

export function addDaysJst(date: JstDate, days: number): JstDate {
  return toJstParts(new Date(jstToUtc(date).getTime() + days * DAY_MS)).date;
}

/** 表示用: 2026/09/25 14:30 */
export function formatJstDateTime(d: Date): string {
  const p = toJstParts(d);
  return `${p.date.replaceAll('-', '/')} ${p.time}`;
}

/** 30分刻みの時刻か（UTC と Asia/Tokyo の差は9時間ちょうどなので UTC で判定してよい） */
export function isSlotAligned(d: Date): boolean {
  const t = d.getTime();
  return Number.isFinite(t) && t % SLOT_MS === 0;
}
