import { describe, expect, it } from 'vitest';
import {
  buildDaySlots,
  formatJstDateTime,
  isSlotAligned,
  jstToUtc,
  selectRange,
  toJstParts,
  validateBookingPeriod,
  weekdayOf,
  type AvailabilityRule,
} from '../src';

// 2026-10-01 は木曜日
const DATE = '2026-10-01';
const rules: AvailabilityRule[] = [{ weekday: 4, openTime: '09:00', closeTime: '12:00' }];
const now = jstToUtc('2026-09-30', '12:00');

describe('time', () => {
  it('Asia/Tokyo と UTC の変換', () => {
    expect(jstToUtc(DATE, '09:00').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(jstToUtc(DATE, '24:00').toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(toJstParts(new Date('2026-09-30T15:30:00Z'))).toEqual({
      date: '2026-10-01',
      time: '00:30',
      weekday: 4,
    });
    expect(weekdayOf(DATE)).toBe(4);
    expect(formatJstDateTime(new Date('2026-10-01T05:30:00Z'))).toBe('2026/10/01 14:30');
  });

  it('不正な日付・時刻は例外', () => {
    expect(() => jstToUtc('2026-02-30')).toThrow();
    expect(() => jstToUtc(DATE, '24:30')).toThrow();
    expect(() => jstToUtc(DATE, '9:00')).toThrow();
  });

  it('30分刻みの判定', () => {
    expect(isSlotAligned(jstToUtc(DATE, '09:30'))).toBe(true);
    expect(isSlotAligned(new Date(jstToUtc(DATE, '09:30').getTime() + 60_000))).toBe(false);
  });
});

describe('buildDaySlots', () => {
  it('営業時間を30分枠に分ける', () => {
    const slots = buildDaySlots({ date: DATE, rules, closures: [], busy: [], now });
    expect(slots).toHaveLength(6);
    expect(slots.map((s) => toJstParts(s.start).time)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ]);
    expect(slots.every((s) => s.status === 'available')).toBe(true);
  });

  it('休業日と他の曜日は枠なし', () => {
    expect(buildDaySlots({ date: DATE, rules, closures: [DATE], busy: [], now })).toEqual([]);
    expect(buildDaySlots({ date: '2026-10-02', rules, closures: [], busy: [], now })).toEqual([]);
  });

  it('予約済み・過去・受付期間外を区別する', () => {
    const busy = [{ start: jstToUtc(DATE, '10:00'), end: jstToUtc(DATE, '11:00') }];
    const slots = buildDaySlots({
      date: DATE,
      rules,
      closures: [],
      busy,
      now: jstToUtc(DATE, '09:00'),
    });
    expect(slots.map((s) => s.status)).toEqual([
      'past',
      'available',
      'booked',
      'booked',
      'available',
      'available',
    ]);

    const far = buildDaySlots({
      date: DATE,
      rules,
      closures: [],
      busy: [],
      now: jstToUtc('2026-08-31', '10:00'),
    });
    // 受付期間の終わりは 2026-09-30 10:00 なので 10/1 の枠はすべて期間外
    expect(far.every((s) => s.status === 'out_of_window')).toBe(true);
  });

  it('同じ曜日の複数の営業時間を重複なくまとめる', () => {
    const slots = buildDaySlots({
      date: DATE,
      rules: [...rules, { weekday: 4, openTime: '11:00', closeTime: '13:00' }],
      closures: [],
      busy: [],
      now,
    });
    expect(slots).toHaveLength(8);
  });
});

describe('selectRange', () => {
  const slots = buildDaySlots({
    date: DATE,
    rules: [
      { weekday: 4, openTime: '09:00', closeTime: '10:00' },
      { weekday: 4, openTime: '13:00', closeTime: '14:00' },
    ],
    closures: [],
    busy: [{ start: jstToUtc(DATE, '13:30'), end: jstToUtc(DATE, '14:00') }],
    now,
  });

  it('開始枠と終了枠の範囲を返す（逆順クリックも可）', () => {
    const r = selectRange(slots, 1, 0, 2);
    expect(r).toEqual({
      ok: true,
      period: { start: jstToUtc(DATE, '09:00'), end: jstToUtc(DATE, '10:00') },
      slots: 2,
    });
  });

  it('最低利用枠数未満は選べない', () => {
    expect(selectRange(slots, 0, 0, 2)).toEqual({ ok: false, error: 'below_min_slots' });
  });

  it('営業時間の切れ目・予約済みをまたげない', () => {
    expect(selectRange(slots, 1, 2, 1)).toEqual({ ok: false, error: 'not_contiguous' });
    expect(selectRange(slots, 2, 3, 1)).toEqual({ ok: false, error: 'unavailable' });
    expect(selectRange(slots, 0, 99, 1)).toEqual({ ok: false, error: 'invalid_range' });
  });
});

describe('validateBookingPeriod', () => {
  const base = { rules, closures: [], busy: [], now, minSlots: 2 };

  it('営業時間内で空いていれば OK', () => {
    const r = validateBookingPeriod(
      { start: jstToUtc(DATE, '10:00'), end: jstToUtc(DATE, '11:30') },
      base,
    );
    expect(r).toMatchObject({ ok: true, slots: 3 });
  });

  it('30分刻みでない・営業時間外・重複はNG', () => {
    expect(
      validateBookingPeriod(
        {
          start: new Date(jstToUtc(DATE, '10:00').getTime() + 60_000),
          end: jstToUtc(DATE, '11:00'),
        },
        base,
      ),
    ).toEqual({ ok: false, error: 'invalid_range' });
    expect(
      validateBookingPeriod({ start: jstToUtc(DATE, '11:00'), end: jstToUtc(DATE, '12:30') }, base),
    ).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(
      validateBookingPeriod(
        { start: jstToUtc(DATE, '10:00'), end: jstToUtc(DATE, '11:00') },
        { ...base, busy: [{ start: jstToUtc(DATE, '10:30'), end: jstToUtc(DATE, '11:00') }] },
      ),
    ).toEqual({ ok: false, error: 'unavailable' });
  });
});
