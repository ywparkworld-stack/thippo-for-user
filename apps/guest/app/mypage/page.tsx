import { SignOutButton } from '@thippo/auth/components';
import { requireAccess } from '@thippo/auth/server';
import { Card } from '@thippo/ui';
import { signOutAction } from '@/lib/auth-actions';

export default async function MyPage() {
  const viewer = await requireAccess('guest', { next: '/mypage' });
  return (
    <Card title="マイページ">
      <p>{viewer.profile.displayName || viewer.email} さん</p>
      <p style={{ color: '#666', fontSize: 13 }}>
        （会員情報・予約履歴はフェーズ 3 以降で追加します）
      </p>
      <SignOutButton action={signOutAction} />
    </Card>
  );
}
