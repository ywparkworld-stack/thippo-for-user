import type { SupabaseClient } from '@supabase/supabase-js';
import { decideAccess, type AccessDecision, type Aal, type AppName, type Role } from '@thippo/core';
import type { Database } from '@thippo/db';

export type AppSupabaseClient = SupabaseClient<Database>;

export interface Viewer {
  userId: string;
  email: string;
  aal: Aal;
  /** 登録済みの2段階認証があれば aal2 */
  nextAal: Aal;
  profile: {
    role: Role;
    status: 'active' | 'suspended';
    deletedAt: string | null;
    displayName: string;
  } | null;
}

/**
 * JWT を検証してログイン中のユーザーを取得する（getSession の値は信用しない）。
 * ロール・状態は JWT ではなく毎回 profiles から読む（停止やロール変更をすぐに反映するため）。
 */
export async function loadViewer(supabase: AppSupabaseClient): Promise<Viewer | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  const userId = claims.sub;

  const [{ data: aalData }, { data: profile }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase
      .from('profiles')
      .select('role, status, deleted_at, display_name')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  return {
    userId,
    email: typeof claims.email === 'string' ? claims.email : '',
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
    nextAal: aalData?.nextLevel === 'aal2' ? 'aal2' : 'aal1',
    profile: profile
      ? {
          role: profile.role,
          status: profile.status,
          deletedAt: profile.deleted_at,
          displayName: profile.display_name,
        }
      : null,
  };
}

export function decideViewerAccess(app: AppName, viewer: Viewer | null): AccessDecision {
  return decideAccess({
    app,
    session: viewer ? { aal: viewer.aal, nextAal: viewer.nextAal } : null,
    profile: viewer?.profile ?? null,
  });
}
