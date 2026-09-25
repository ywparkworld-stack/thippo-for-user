import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * ブラウザ・サーバーコンポーネント用（anon key）。権限は RLS で制御される。
 * Cookie でのセッション管理（@supabase/ssr）はフェーズ 2 で各アプリに追加する。
 */
export function createBrowserSupabaseClient(url: string, anonKey: string) {
  return createClient<Database>(url, anonKey);
}
