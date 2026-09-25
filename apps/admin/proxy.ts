import { verifyAdminEdgeAccess } from '@thippo/auth/edge-access';
import { createAuthProxy } from '@thippo/auth/proxy';

// ログイン前に開けるのは認証の画面だけ
const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth/confirm'];

export const proxy = createAuthProxy('admin', {
  isProtected: (pathname) => !PUBLIC_PATHS.includes(pathname),
  // 前段（Cloudflare Access など）を経由していないアクセスは、ログイン画面も含めて拒否する
  verifyEdgeAccess: verifyAdminEdgeAccess,
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
