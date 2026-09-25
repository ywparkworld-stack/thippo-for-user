/** 金額の表示（整数の円）。計算はしない */
export function Yen({ value }: { value: number }) {
  return <span>{`${value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('ja-JP')}`}</span>;
}
