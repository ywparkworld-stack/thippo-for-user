import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

/**
 * 運営管理の前段のアクセス制限（docs/admin-access.md）をアプリ側でも確認する。
 *
 * ADMIN_ACCESS_MODE:
 *   - cloudflare: Cloudflare Access が付ける JWT（Cf-Access-Jwt-Assertion）を検証する。
 *                 Cloudflare を経由しない直接アクセス（*.vercel.app など）を拒否できる
 *   - vercel:     Vercel の Password Protection / Trusted IPs で制限している（Vercel のエッジで拒否される）
 *   - none:       制限なし。ローカル開発と E2E 用。本番（VERCEL_ENV=production）では拒否する
 *   - 未設定:      すべて拒否する（設定漏れで公開されないようにする）
 */
export async function verifyAdminEdgeAccess(request: NextRequest): Promise<boolean> {
  const mode = process.env.ADMIN_ACCESS_MODE;
  switch (mode) {
    case 'cloudflare':
      return verifyCloudflareAccess(request.headers.get('cf-access-jwt-assertion'));
    case 'vercel':
      return true;
    case 'none':
      return process.env.VERCEL_ENV !== 'production';
    default:
      return false;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function verifyCloudflareAccess(token: string | null): Promise<boolean> {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN; // 例: thippo.cloudflareaccess.com
  const audience = process.env.CF_ACCESS_AUD;
  if (!token || !teamDomain || !audience) return false;
  jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  try {
    await jwtVerify(token, jwks, { issuer: `https://${teamDomain}`, audience });
    return true;
  } catch {
    return false;
  }
}
