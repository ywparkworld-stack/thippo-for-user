import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * service role のクライアント。RLS を通らないため、サーバー側（Route Handler / Server Action / Cron）でのみ使う。
 * クライアントバンドルに含めないよう、アプリ側では `import 'server-only'` をしたモジュールから呼ぶこと。
 */
export function createServiceRoleClient(): ReturnType<typeof createClient<Database>> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  if ('window' in globalThis)
    throw new Error('service role client must not be used in the browser');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
