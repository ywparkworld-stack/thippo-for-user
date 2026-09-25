/** 円の金額を表す整数。浮動小数点を使わないよう、演算はすべて整数で行う。 */
export type Yen = number;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function assertYen(value: number, label = 'amount'): asserts value is Yen {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer (got ${value})`);
  }
}

export function assertNonNegativeYen(value: number, label = 'amount'): asserts value is Yen {
  assertYen(value, label);
  if (value < 0) throw new MoneyError(`${label} must be >= 0 (got ${value})`);
}

/** 整数どうしの割り算の切り上げ（a >= 0, b > 0） */
export function ceilDiv(a: number, b: number): number {
  assertYen(a, 'numerator');
  assertYen(b, 'denominator');
  if (a < 0 || b <= 0) throw new MoneyError('ceilDiv expects a >= 0 and b > 0');
  return Math.floor((a + b - 1) / b);
}

/** 整数どうしの割り算の切り捨て（a >= 0, b > 0） */
export function floorDiv(a: number, b: number): number {
  assertYen(a, 'numerator');
  assertYen(b, 'denominator');
  if (a < 0 || b <= 0) throw new MoneyError('floorDiv expects a >= 0 and b > 0');
  return Math.floor(a / b);
}

export function sumYen(values: readonly number[]): Yen {
  let total = 0;
  for (const v of values) {
    assertYen(v);
    total += v;
  }
  assertYen(total, 'sum');
  return total;
}

export function formatYen(value: Yen): string {
  assertYen(value);
  return `${value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('ja-JP')}`;
}
