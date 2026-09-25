import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { AppName } from '@thippo/core';
import type { Database } from '@thippo/db';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { authCookieOptions, supabasePublicEnv } from './config';
import { redirectPathFor } from './paths';
import { decideViewerAccess, loadViewer, type AppSupabaseClient, type Viewer } from './viewer';

export type { Viewer, AppSupabaseClient };

/** リクエストごとの Supabase クライアント（ログイン中のユーザーの権限。RLS が効く） */
export async function createSupabaseForRequest(app: AppName): Promise<AppSupabaseClient> {
  // cookies() を先に呼び、このページを動的レンダリングにする（ビルド時に事前レンダリングしない）
  const store = await cookies();
  const { url, anonKey } = supabasePublicEnv();
  return createServerClient<Database>(url, anonKey, {
    cookieOptions: authCookieOptions(app),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component からは Cookie を書けない。セッションの更新は proxy が行う
        }
      },
    },
  });
}

/** 同じリクエスト内では1回だけ取得する */
export const getViewer = cache(async (app: AppName): Promise<Viewer | null> => {
  return loadViewer(await createSupabaseForRequest(app), app);
});

export type AllowedViewer = Viewer & { profile: NonNullable<Viewer['profile']> };

/**
 * ページ・Server Action の先頭で呼ぶ。アクセスできなければリダイレクトする（proxy と二重に確認する）。
 * mfaStep を指定すると、運営の2段階認証の登録・入力画面でだけ aal1 のセッションを通す。
 */
export async function requireAccess(
  app: AppName,
  opts: { mfaStep?: 'mfa_enroll' | 'mfa_verify'; next?: string } = {},
): Promise<AllowedViewer> {
  const viewer = await getViewer(app);
  const decision = decideViewerAccess(app, viewer);
  if (decision.kind === 'allow') return viewer as AllowedViewer;
  if (opts.mfaStep && decision.kind === opts.mfaStep) return viewer as AllowedViewer;
  redirect(redirectPathFor(decision, opts.next));
}

/** クライアントの IP（Vercel では x-forwarded-for の先頭が接続元） */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown').slice(0, 64);
}
