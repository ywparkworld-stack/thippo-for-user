import { requireAccess } from '@thippo/auth/server';
import { ResetPasswordForm } from '@thippo/auth/components';
import { Card } from '@thippo/ui';
import { resetPasswordAction } from '@/lib/auth-actions';

export default async function ResetPasswordPage() {
  await requireAccess('admin', { next: '/reset-password' });
  return (
    <Card title="新しいパスワードの設定">
      <ResetPasswordForm action={resetPasswordAction} />
    </Card>
  );
}
