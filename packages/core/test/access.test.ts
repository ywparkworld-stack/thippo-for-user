import { describe, expect, it } from 'vitest';
import { decideAccess, safeNextPath, type AccessInput } from '../src';

const active = { status: 'active' as const, deletedAt: null };
const s1 = { aal: 'aal1' as const, nextAal: 'aal1' as const };

function input(p: Partial<AccessInput>): AccessInput {
  return { app: 'guest', session: s1, profile: { role: 'guest', ...active }, ...p };
}

describe('decideAccess', () => {
  it('未ログインはログイン画面へ', () => {
    expect(decideAccess(input({ session: null }))).toEqual({ kind: 'login', reason: 'signed_out' });
  });

  it('アプリごとに入れるロールが決まっている', () => {
    const cases = [
      ['guest', 'guest', true],
      ['guest', 'host', false],
      ['guest', 'admin', false],
      ['host', 'host', true],
      ['host', 'guest', false],
      ['host', 'admin', false],
      ['admin', 'guest', false],
      ['admin', 'host', false],
    ] as const;
    for (const [app, role, ok] of cases) {
      expect(decideAccess(input({ app, profile: { role, ...active } }))).toEqual(
        ok ? { kind: 'allow' } : { kind: 'login', reason: 'wrong_role' },
      );
    }
  });

  it('停止中・削除済み・プロフィールなしは入れない', () => {
    expect(
      decideAccess(input({ profile: { role: 'guest', status: 'suspended', deletedAt: null } })),
    ).toEqual({
      kind: 'login',
      reason: 'suspended',
    });
    expect(
      decideAccess(
        input({ profile: { role: 'guest', status: 'active', deletedAt: '2026-01-01' } }),
      ),
    ).toEqual({
      kind: 'login',
      reason: 'no_profile',
    });
    expect(decideAccess(input({ profile: null }))).toEqual({ kind: 'login', reason: 'no_profile' });
  });

  it('運営は2段階認証（aal2）が必須', () => {
    const admin = { role: 'admin' as const, ...active };
    expect(
      decideAccess({ app: 'admin', profile: admin, session: { aal: 'aal1', nextAal: 'aal1' } }),
    ).toEqual({
      kind: 'mfa_enroll',
    });
    expect(
      decideAccess({ app: 'admin', profile: admin, session: { aal: 'aal1', nextAal: 'aal2' } }),
    ).toEqual({
      kind: 'mfa_verify',
    });
    expect(
      decideAccess({ app: 'admin', profile: admin, session: { aal: 'aal2', nextAal: 'aal2' } }),
    ).toEqual({
      kind: 'allow',
    });
  });

  it('ロールの確認は2段階認証より先（admin 以外に2段階認証の画面を見せない）', () => {
    expect(
      decideAccess({ app: 'admin', profile: { role: 'host', ...active }, session: s1 }),
    ).toEqual({
      kind: 'login',
      reason: 'wrong_role',
    });
  });
});

describe('safeNextPath', () => {
  it('同じサイト内のパスだけを許可する', () => {
    expect(safeNextPath('/checkout?x=1#a')).toBe('/checkout?x=1#a');
    expect(safeNextPath('/mypage')).toBe('/mypage');
  });

  it('外部サイトへの戻り先は既定値にする', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'evil',
      '',
      null,
      undefined,
      '/a\nb',
    ]) {
      expect(safeNextPath(bad, '/home')).toBe('/home');
    }
  });
});
