import 'server-only';
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  totpCodeSchema,
  type AppName,
} from '@thippo/core';
import { redirect } from 'next/navigation';
import { appUrl, AUTH_PATHS } from './config';
import { LOGIN_REASON_MESSAGES, redirectPathFor } from './paths';
import { hashForKey, hitRateLimit, hitRateLimits, writeAuditLog } from './security';
import { clientIp, createSupabaseForRequest, requireAccess } from './server';
import { decideViewerAccess, loadViewer } from './viewer';

/** フォームの状態（useActionState 用） */
export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  email?: string;
}

const TOO_MANY = '試行回数が多すぎます。しばらく時間をおいてからお試しください。';

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === 'string' ? v : undefined;
}

// ---------------------------------------------------------------------------
// ログイン・ログアウト
// ---------------------------------------------------------------------------

export async function signIn(
  app: AppName,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: str(formData, 'email'),
    password: str(formData, 'password'),
    next: str(formData, 'next') || undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), email: str(formData, 'email') };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const allowed = await hitRateLimits([
    ['loginPerEmail', `${app}:${hashForKey(email)}`],
    ['loginPerIp', `${app}:${hashForKey(ip)}`],
  ]);
  if (!allowed) return { message: TOO_MANY, email };

  const supabase = await createSupabaseForRequest(app);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (app === 'admin') {
      await writeAuditLog({
        actorId: null,
        action: 'admin.login_failed',
        payload: { email_hash: hashForKey(email), ip },
      });
    }
    if (error.code === 'email_not_confirmed') {
      return {
        message: 'メールアドレスの確認が済んでいません。届いたメールのリンクを開いてください。',
        email,
      };
    }
    // アカウントの有無が分からないよう、理由は区別しない
    return { message: 'メールアドレスまたはパスワードが正しくありません。', email };
  }

  const viewer = await loadViewer(supabase);
  const decision = decideViewerAccess(app, viewer);
  if (decision.kind === 'login') {
    await supabase.auth.signOut({ scope: 'local' });
    if (app === 'admin') {
      await writeAuditLog({
        actorId: viewer?.userId ?? null,
        action: 'admin.login_denied',
        payload: { reason: decision.reason, ip },
      });
    }
    return {
      message: LOGIN_REASON_MESSAGES[decision.reason] ?? 'ログインできませんでした。',
      email,
    };
  }
  if (app === 'admin') {
    await writeAuditLog({
      actorId: viewer!.userId,
      action: 'admin.login',
      payload: { ip, step: decision.kind },
    });
  }
  redirect(decision.kind === 'allow' ? safeNextPath(next) : redirectPathFor(decision));
}

export async function signOut(app: AppName): Promise<never> {
  const supabase = await createSupabaseForRequest(app);
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut({ scope: 'local' });
  if (app === 'admin' && data?.claims?.sub) {
    await writeAuditLog({ actorId: data.claims.sub, action: 'admin.logout' });
  }
  redirect(AUTH_PATHS.login);
}

// ---------------------------------------------------------------------------
// パスワード再設定
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  app: AppName,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: str(formData, 'email') });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), email: str(formData, 'email') };
  const { email } = parsed.data;

  const ip = await clientIp();
  const allowed = await hitRateLimits([
    ['passwordResetPerEmail', `${app}:${hashForKey(email)}`],
    ['passwordResetPerIp', `${app}:${hashForKey(ip)}`],
  ]);
  if (!allowed) return { message: TOO_MANY, email };

  const supabase = await createSupabaseForRequest(app);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl(app)}${AUTH_PATHS.confirm}?next=${encodeURIComponent(AUTH_PATHS.resetPassword)}`,
  });
  if (error) console.error('resetPasswordForEmail failed', error.code);
  // アカウントの有無が分からないよう、常に同じ結果を返す
  return {
    ok: true,
    message: 'ご登録のメールアドレスであれば、パスワード再設定のメールを送信しました。',
  };
}

export async function resetPassword(
  app: AppName,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireAccess(app, { next: AUTH_PATHS.resetPassword });
  const parsed = resetPasswordSchema.safeParse({
    password: str(formData, 'password'),
    passwordConfirm: str(formData, 'passwordConfirm'),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseForRequest(app);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'same_password')
      return { errors: { password: '現在と異なるパスワードにしてください' } };
    if (error.code === 'weak_password')
      return { errors: { password: 'より推測されにくいパスワードにしてください' } };
    return { message: 'パスワードを変更できませんでした。もう一度お試しください。' };
  }
  if (app === 'admin')
    await writeAuditLog({ actorId: viewer.userId, action: 'admin.password_change' });
  redirect('/');
}

// ---------------------------------------------------------------------------
// 運営の2段階認証（TOTP）
// ---------------------------------------------------------------------------

export interface TotpEnrollment {
  factorId: string;
  /** QR コード（SVG の data URL） */
  qrCode: string;
  secret: string;
}

/** 認証アプリに登録する QR コードを発行する。未完了の登録が残っていれば削除してからやり直す */
export async function startTotpEnrollment(): Promise<TotpEnrollment | { error: string }> {
  await requireAccess('admin', { mfaStep: 'mfa_enroll' });
  const supabase = await createSupabaseForRequest('admin');
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified')
      await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'thippo-admin',
  });
  if (error || !data) return { error: '2段階認証の登録を開始できませんでした。' };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(
  step: 'mfa_enroll' | 'mfa_verify',
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireAccess('admin', { mfaStep: step });
  if (!(await hitRateLimit('mfaVerifyPerUser', viewer.userId))) return { message: TOO_MANY };

  const supabase = await createSupabaseForRequest('admin');
  let factorId = str(formData, 'factorId') ?? '';
  if (step === 'mfa_verify') {
    // 入力画面では、登録済みの TOTP を使う（フォームの値は信用しない）
    const { data } = await supabase.auth.mfa.listFactors();
    factorId = data?.totp?.[0]?.id ?? '';
  }
  const parsed = totpCodeSchema.safeParse({ factorId, code: str(formData, 'code') });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) {
    await writeAuditLog({ actorId: viewer.userId, action: 'admin.mfa_failed', payload: { step } });
    return { errors: { code: 'コードが正しくないか、有効期限が切れています' } };
  }
  await writeAuditLog({
    actorId: viewer.userId,
    action: step === 'mfa_enroll' ? 'admin.mfa_enroll' : 'admin.mfa_verify',
  });
  redirect('/');
}

export type { EmailOtpType };
