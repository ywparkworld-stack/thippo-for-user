import { SignOutButton } from '@thippo/auth/components';
import { requireAccess } from '@thippo/auth/server';
import { signOutAction } from '@/lib/auth-actions';

export default async function Dashboard() {
  const viewer = await requireAccess('admin');
  return (
    <main style={{ padding: 24 }}>
      <h1>thippo 運営管理</h1>
      <p>{viewer.email} でログイン中（2段階認証済み）</p>
      <p style={{ color: '#666', fontSize: 13 }}>（各画面はフェーズ 3 以降で追加します）</p>
      <SignOutButton action={signOutAction} />
    </main>
  );
}
