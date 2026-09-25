import { describe, expect, it } from 'vitest';
import { fieldErrors, loginSchema, resetPasswordSchema, totpCodeSchema } from '../src';

describe('認証フォームの入力検証', () => {
  it('メールアドレスは前後の空白を除き小文字にする', () => {
    const r = loginSchema.parse({ email: '  Foo@Example.COM ', password: 'x' });
    expect(r.email).toBe('foo@example.com');
  });

  it('不正なメールアドレス・空のパスワードはエラー', () => {
    const r = loginSchema.safeParse({ email: 'foo', password: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(['email', 'password']);
  });

  it('新しいパスワードは10文字以上で、確認用と一致する', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'short', passwordConfirm: 'short' }).success,
    ).toBe(false);
    const mismatch = resetPasswordSchema.safeParse({
      password: 'longenough1',
      passwordConfirm: 'longenough2',
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(fieldErrors(mismatch.error)).toHaveProperty('passwordConfirm');
    expect(
      resetPasswordSchema.safeParse({ password: 'longenough1', passwordConfirm: 'longenough1' })
        .success,
    ).toBe(true);
  });

  it('2段階認証のコードは6桁の数字', () => {
    expect(totpCodeSchema.safeParse({ factorId: 'f', code: '123456' }).success).toBe(true);
    expect(totpCodeSchema.safeParse({ factorId: 'f', code: '12345a' }).success).toBe(false);
  });
});
