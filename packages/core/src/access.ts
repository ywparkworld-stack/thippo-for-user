/**
 * 各アプリに入れるかどうかの判定（proxy とサーバー側の両方で使う）。
 * 画面の表示を隠すだけの制御にしないよう、DB 側でも RLS で同じ条件を確認している。
 */
export type AppName = 'guest' | 'host' | 'admin';
export type Role = 'guest' | 'host' | 'admin';
export type Aal = 'aal1' | 'aal2';

/** アプリごとに入れるロール */
export const APP_ROLES: Record<AppName, readonly Role[]> = {
  guest: ['guest'],
  host: ['host'],
  admin: ['admin'],
};

export interface AccessInput {
  app: AppName;
  /** ログインしていなければ null */
  session: {
    /** 現在のセッションの認証レベル */
    aal: Aal;
    /** 登録済みの2段階認証があれば aal2（= これから aal2 に上げられる） */
    nextAal: Aal;
  } | null;
  /** profiles の行。見つからなければ null */
  profile: { role: Role; status: 'active' | 'suspended'; deletedAt: string | null } | null;
}

export type AccessDecision =
  | { kind: 'allow' }
  /** ログイン画面へ */
  | { kind: 'login'; reason: 'signed_out' | 'wrong_role' | 'suspended' | 'no_profile' }
  /** 運営: 2段階認証の登録が必要 */
  | { kind: 'mfa_enroll' }
  /** 運営: 2段階認証のコード入力が必要 */
  | { kind: 'mfa_verify' };

export function decideAccess(input: AccessInput): AccessDecision {
  if (!input.session) return { kind: 'login', reason: 'signed_out' };
  const p = input.profile;
  if (!p || p.deletedAt) return { kind: 'login', reason: 'no_profile' };
  if (p.status !== 'active') return { kind: 'login', reason: 'suspended' };
  if (!APP_ROLES[input.app].includes(p.role)) return { kind: 'login', reason: 'wrong_role' };
  if (input.app === 'admin' && input.session.aal !== 'aal2') {
    return input.session.nextAal === 'aal2' ? { kind: 'mfa_verify' } : { kind: 'mfa_enroll' };
  }
  return { kind: 'allow' };
}

/**
 * ログイン後の戻り先として安全なパスか（オープンリダイレクト対策）。
 * 同じアプリ内の絶対パスだけを許可する。
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  // 制御文字とバックスラッシュ（ブラウザが / と解釈する）を含むものは拒否する
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  return next;
}
