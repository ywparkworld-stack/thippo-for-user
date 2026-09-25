import { SignOutButton } from '@thippo/auth/components';
import { requireAccess } from '@thippo/auth/server';
import { signOutAction } from '@/lib/auth-actions';

export default async function Dashboard() {
  const viewer = await requireAccess('host');
  return (
    <main style={{ padding: 24 }}>
      <h1>thippo 貸出主センター</h1>
      <p>{viewer.email} でログイン中</p>
      <p style={{ color: '#666', fontSize: 13 }}>（ダッシュボードはフェーズ 4 以降で追加します）</p>
      <SignOutButton action={signOutAction} />
    </main>
  );
}
