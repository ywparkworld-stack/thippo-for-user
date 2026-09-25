/** レート制限の設定値（固定ウィンドウ）。キーはサーバー側で IP とメールアドレスのハッシュから作る */
export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  loginPerEmail: { limit: 10, windowSeconds: 10 * 60 },
  loginPerIp: { limit: 50, windowSeconds: 10 * 60 },
  signupPerIp: { limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerEmail: { limit: 5, windowSeconds: 60 * 60 },
  passwordResetPerIp: { limit: 20, windowSeconds: 60 * 60 },
  mfaVerifyPerUser: { limit: 10, windowSeconds: 10 * 60 },
  cancelPerUser: { limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;
