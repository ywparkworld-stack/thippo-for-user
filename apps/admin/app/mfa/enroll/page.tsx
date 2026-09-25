import { SignOutButton, TotpEnrollForm } from '@thippo/auth/components';
import { requireAccess } from '@thippo/auth/server';
import { Card } from '@thippo/ui';
import {
  signOutAction,
  startTotpEnrollmentAction,
  verifyTotpEnrollmentAction,
} from '@/lib/auth-actions';

// 2段階認証を登録していない admin が開けるのはこの画面だけ（運営用のデータは表示しない）
export default async function MfaEnrollPage() {
  await requireAccess('admin', { mfaStep: 'mfa_enroll' });
  return (
    <Card title="2段階認証の登録">
      <TotpEnrollForm start={startTotpEnrollmentAction} verify={verifyTotpEnrollmentAction} />
      <div style={{ marginTop: 24 }}>
        <SignOutButton action={signOutAction} />
      </div>
    </Card>
  );
}
