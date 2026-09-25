import { SignOutButton, TotpCodeForm } from '@thippo/auth/components';
import { requireAccess } from '@thippo/auth/server';
import { Card } from '@thippo/ui';
import { signOutAction, verifyTotpChallengeAction } from '@/lib/auth-actions';

export default async function MfaVerifyPage() {
  await requireAccess('admin', { mfaStep: 'mfa_verify' });
  return (
    <Card title="2段階認証">
      <TotpCodeForm action={verifyTotpChallengeAction} />
      <div style={{ marginTop: 24 }}>
        <SignOutButton action={signOutAction} />
      </div>
    </Card>
  );
}
