import 'server-only';
import { createHash } from 'node:crypto';
import { RATE_LIMITS, type RateLimitName } from '@thippo/core';
import type { Json } from '@thippo/db';
import { createServiceRoleClient } from '@thippo/db/server';

/** レート制限のキーに個人情報をそのまま入れないためのハッシュ */
export function hashForKey(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * レート制限を1回数える。上限を超えていれば false。
 * 判定は DB（rate_limit_hit）で行うため、複数のサーバーインスタンスでも共有される。
 */
export async function hitRateLimit(name: RateLimitName, subject: string): Promise<boolean> {
  const rule = RATE_LIMITS[name];
  const { data, error } = await createServiceRoleClient().rpc('rate_limit_hit', {
    p_key: `${name}:${subject}`,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return Boolean(data?.[0]?.allowed);
}

export async function hitRateLimits(checks: [RateLimitName, string][]): Promise<boolean> {
  const results = await Promise.all(checks.map(([name, subject]) => hitRateLimit(name, subject)));
  return results.every(Boolean);
}

/**
 * 操作ログを記録する（service role）。actor は呼び出し側でサーバーが確認したユーザー ID を渡すこと。
 * 運営の aal2 セッションから記録する場合は RPC log_admin_action を使ってもよい。
 */
export async function writeAuditLog(entry: {
  actorId: string | null;
  action: string;
  targetTable?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await createServiceRoleClient().rpc('write_audit_log', {
    // 本人が特定できない操作（ログイン失敗など）は actor なしで記録する（DB 側は null を許可）
    p_actor_id: entry.actorId as string,
    p_action: entry.action,
    p_target_table: entry.targetTable,
    p_target_id: entry.targetId,
    p_payload: (entry.payload ?? {}) as Json,
  });
  if (error) throw new Error(`audit log failed: ${error.message}`);
}
