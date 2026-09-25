import type { AppName } from '@thippo/core';

export type { AppName };

/**
 * アプリごとに別の Cookie 名を使う。本番はサブドメインごとに Cookie が分かれるが、
 * ローカル（localhost の別ポート）では Cookie が共有されるため名前でも分ける。
 * 運営管理のセッションが利用者サイトや貸出主センターに漏れないようにするため。
 */
export function authCookieName(app: AppName): string {
  return `thippo-${app}-auth`;
}

export function authCookieOptions(app: AppName) {
  return {
    name: authCookieName(app),
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    // セッションはサーバー側（Server Action / Route Handler / proxy）だけで扱う。
    // ブラウザの JavaScript からトークンを読めないようにする
    httpOnly: true,
  };
}

export const AUTH_PATHS = {
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  confirm: '/auth/confirm',
  mfaEnroll: '/mfa/enroll',
  mfaVerify: '/mfa/verify',
} as const;

/** 各アプリの公開 URL（メールのリンクに使う）。本番ドメインは TODO(要確認) */
export function appUrl(app: AppName): string {
  const url =
    app === 'guest'
      ? process.env.NEXT_PUBLIC_GUEST_URL
      : app === 'host'
        ? process.env.NEXT_PUBLIC_HOST_URL
        : process.env.ADMIN_URL;
  if (!url) throw new Error(`URL for ${app} app is not configured`);
  return url.replace(/\/$/, '');
}

export function supabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
  return { url, anonKey };
}

export { LOGIN_REASON_MESSAGES } from './paths';
