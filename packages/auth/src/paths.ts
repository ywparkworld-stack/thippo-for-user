import type { AccessDecision } from '@thippo/core';
import { AUTH_PATHS } from './config';

/** アクセスできなかったときの移動先 */
export function redirectPathFor(
  decision: Exclude<AccessDecision, { kind: 'allow' }>,
  next?: string,
): string {
  switch (decision.kind) {
    case 'mfa_enroll':
      return AUTH_PATHS.mfaEnroll;
    case 'mfa_verify':
      return AUTH_PATHS.mfaVerify;
    case 'login': {
      const params = new URLSearchParams();
      if (decision.reason !== 'signed_out') params.set('reason', decision.reason);
      if (next && next !== '/') params.set('next', next);
      const q = params.toString();
      return q ? `${AUTH_PATHS.login}?${q}` : AUTH_PATHS.login;
    }
  }
}

export const LOGIN_REASON_MESSAGES: Record<string, string> = {
  wrong_role: 'このサイトではご利用いただけないアカウントです。',
  suspended: 'このアカウントは停止されています。お問い合わせください。',
  no_profile: 'アカウント情報が見つかりません。お問い合わせください。',
  link_invalid: 'リンクが無効か、有効期限が切れています。もう一度お試しください。',
};
