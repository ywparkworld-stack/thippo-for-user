import { ForgotPasswordForm } from '@thippo/auth/components';
import { Card } from '@thippo/ui';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/lib/auth-actions';

export default function ForgotPasswordPage() {
  return (
    <Card title="パスワードの再設定">
      <ForgotPasswordForm action={requestPasswordResetAction} />
      <p style={{ fontSize: 14 }}>
        <Link href="/login">ログインに戻る</Link>
      </p>
    </Card>
  );
}
