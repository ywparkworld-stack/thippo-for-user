import { createAuthProxy } from '@thippo/auth/proxy';

// 利用者サイトは基本的に公開。会員向けのページだけログインを必須にする
const PROTECTED_PREFIXES = ['/mypage', '/checkout', '/reset-password'];

export const proxy = createAuthProxy('guest', {
  isProtected: (pathname) =>
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
