import { minPricePer30min, PRICING } from '@thippo/core';

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>thippo</h1>
      <p>空き会議室・空き部屋を30分単位で予約できます。</p>
      <p style={{ color: '#666', fontSize: 12 }}>
        （開発中）運営手数料 1時間あたり {PRICING.platformFeePerHourExclTax} 円（税抜）／
        30分あたりの最低料金 {minPricePer30min(1)} 円
      </p>
    </main>
  );
}
