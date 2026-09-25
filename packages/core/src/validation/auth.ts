import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt の上限（72 バイト）を超えないように文字数でも制限する */
export const PASSWORD_MAX_LENGTH = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'メールアドレスが長すぎます')
  .pipe(z.email('メールアドレスの形式が正しくありません'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(PASSWORD_MAX_LENGTH, `パスワードは${PASSWORD_MAX_LENGTH}文字以下にしてください`);

export const loginSchema = z.object({
  email: emailSchema,
  // ログイン時は長さの下限を見ない（既存のパスワードの形式を問わない）
  password: z.string().min(1, 'パスワードを入力してください').max(PASSWORD_MAX_LENGTH),
  next: z.string().max(2048).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirm'],
  });

export const totpCodeSchema = z.object({
  factorId: z.string().min(1).max(100),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, '6桁の数字を入力してください'),
});

/** zod のエラーを「項目名 → 最初のメッセージ」にする（フォーム表示用） */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
