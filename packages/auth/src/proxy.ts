import { createServerClient } from '@supabase/ssr';
import type { AppName } from '@thippo/core';
import type { Database } from '@thippo/db';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PATHS, authCookieOptions, supabasePublicEnv } from './config';
import { redirectPathFor } from './paths';
import { decideViewerAccess, loadViewer } from './viewer';

export interface AuthProxyOptions {
  /** ログインが必要なパスか。false のパスでもセッションの更新は行う */
  isProtected: (pathname: string) => boolean;
  /** 前段のアクセス制限の確認（運営管理）。false なら画面を一切表示しない */
  verifyEdgeAccess?: (request: NextRequest) => Promise<boolean>;
}

const MFA_PATHS: string[] = [AUTH_PATHS.mfaEnroll, AUTH_PATHS.mfaVerify];

/**
 * 各アプリの proxy.ts から使う。
 *   1. Supabase のセッションを更新する（期限切れのトークンをリフレッシュして Cookie を書き直す）
 *   2. 保護されたパスでは、ロール・アカウント状態・（運営は）2段階認証を確認する
 * ここでの確認は入口のチェックで、各ページ・Server Action でも requireAccess で再確認し、
 * DB でも RLS で制限している。
 */
export function createAuthProxy(app: AppName, options: AuthProxyOptions) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    if (options.verifyEdgeAccess && !(await options.verifyEdgeAccess(request))) {
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      });
    }
    const { url, anonKey } = supabasePublicEnv();
    let response = NextResponse.next({ request });

    const supabase = createServerClient<Database>(url, anonKey, {
      cookieOptions: authCookieOptions(app),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options: o }) =>
            response.cookies.set(name, value, o),
          );
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });

    const viewer = await loadViewer(supabase);
    const pathname = request.nextUrl.pathname;
    const isMfaPath = MFA_PATHS.includes(pathname);

    if (!options.isProtected(pathname) && !isMfaPath) return response;

    const decision = decideViewerAccess(app, viewer);
    if (decision.kind === 'allow') {
      // 2段階認証済みなら認証画面には用がない
      return isMfaPath ? redirectKeepingCookies(request, response, '/') : response;
    }
    if (decision.kind === 'mfa_enroll' || decision.kind === 'mfa_verify') {
      const target = redirectPathFor(decision);
      return pathname === target ? response : redirectKeepingCookies(request, response, target);
    }
    // ロールが合わない・停止中のセッションは、このアプリからはログアウトさせる
    if (viewer && decision.reason !== 'signed_out') {
      await supabase.auth.signOut({ scope: 'local' });
    }
    const next = isMfaPath ? undefined : pathname + request.nextUrl.search;
    return redirectKeepingCookies(request, response, redirectPathFor(decision, next));
  };
}

/** セッション更新で書き換えた Cookie を引き継いでリダイレクトする */
function redirectKeepingCookies(
  request: NextRequest,
  from: NextResponse,
  path: string,
): NextResponse {
  const res = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const v = from.headers.get(key);
    if (v) res.headers.set(key, v);
  }
  return res;
}
