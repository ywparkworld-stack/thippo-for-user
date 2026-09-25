import { LoginForm } from '@thippo/auth/components';
import { LOGIN_REASON_MESSAGES } from '@thippo/auth/config';
import { safeNextPath } from '@thippo/core';
import { Card } from '@thippo/ui';
import Link from 'next/link';
import { signInAction } from '@/lib/auth-actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  return (
    <Card title="ログイン">
      <LoginForm
        action={signInAction}
        next={safeNextPath(next, '/mypage')}
        notice={reason ? LOGIN_REASON_MESSAGES[reason] : undefined}
      />
      <p style={{ fontSize: 14 }}>
        <Link href="/forgot-password">パスワードをお忘れの方</Link>
      </p>
    </Card>
  );
}
