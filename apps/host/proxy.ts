import { createAuthProxy } from '@thippo/auth/proxy';

// ログイン前に開けるのは認証の画面だけ
const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth/confirm'];

export const proxy = createAuthProxy('host', {
  isProtected: (pathname) => !PUBLIC_PATHS.includes(pathname),
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
