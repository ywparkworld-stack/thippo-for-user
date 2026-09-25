import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyAdminEdgeAccess } from '../src/edge-access';

const TEAM = 'thippo-test.cloudflareaccess.com';
const AUD = 'aud-123';

function req(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set('cf-access-jwt-assertion', token);
  return { headers } as unknown as NextRequest;
}

let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  // Cloudflare の公開鍵エンドポイントの代わり
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function token(opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT({ email: 'ops@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? privateKey);
}

describe('verifyAdminEdgeAccess', () => {
  it('ADMIN_ACCESS_MODE が未設定なら拒否する', async () => {
    vi.stubEnv('ADMIN_ACCESS_MODE', '');
    expect(await verifyAdminEdgeAccess(req())).toBe(false);
  });

  it('none は本番（VERCEL_ENV=production）では拒否する', async () => {
    vi.stubEnv('ADMIN_ACCESS_MODE', 'none');
    expect(await verifyAdminEdgeAccess(req())).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await verifyAdminEdgeAccess(req())).toBe(false);
  });

  describe('cloudflare', () => {
    function useCloudflare() {
      vi.stubEnv('ADMIN_ACCESS_MODE', 'cloudflare');
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', TEAM);
      vi.stubEnv('CF_ACCESS_AUD', AUD);
    }

    it('正しい JWT なら通す', async () => {
      useCloudflare();
      expect(await verifyAdminEdgeAccess(req(await token()))).toBe(true);
    });

    it('JWT がない・署名が違う・宛先が違う・発行元が違う・期限切れなら拒否する', async () => {
      useCloudflare();
      expect(await verifyAdminEdgeAccess(req())).toBe(false);
      expect(await verifyAdminEdgeAccess(req(await token({ key: otherKey })))).toBe(false);
      expect(await verifyAdminEdgeAccess(req(await token({ aud: 'other' })))).toBe(false);
      expect(
        await verifyAdminEdgeAccess(req(await token({ iss: 'https://evil.cloudflareaccess.com' }))),
      ).toBe(false);
      expect(await verifyAdminEdgeAccess(req(await token({ exp: '-1m' })))).toBe(false);
      expect(await verifyAdminEdgeAccess(req('not-a-jwt'))).toBe(false);
    });

    it('設定が足りなければ拒否する', async () => {
      useCloudflare();
      vi.stubEnv('CF_ACCESS_AUD', '');
      expect(await verifyAdminEdgeAccess(req(await token()))).toBe(false);
    });
  });
});
