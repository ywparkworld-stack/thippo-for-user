import type { EmailOtpType } from '@supabase/supabase-js';
import { safeNextPath, type AppName } from '@thippo/core';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PATHS } from './config';
import { createSupabaseForRequest } from './server';

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'recovery',
  'email',
  'email_change',
  'magiclink',
];

/**
 * メールのリンク（会員登録の確認・パスワード再設定・招待）を受け取る Route Handler。
 * メールテンプレートは supabase/templates にあり、token_hash を付けてこの URL に戻す。
 */
export function createConfirmHandler(app: AppName) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const params = request.nextUrl.searchParams;
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    const code = params.get('code');
    const next = safeNextPath(params.get('next'));
    const supabase = await createSupabaseForRequest(app);

    let ok = false;
    if (tokenHash && type && OTP_TYPES.includes(type)) {
      ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    } else if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
    const target = ok ? next : `${AUTH_PATHS.login}?reason=link_invalid`;
    return NextResponse.redirect(new URL(target, request.url));
  };
}
