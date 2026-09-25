/**
 * DB テストの接続先。
 *
 * - 既定（DB_TEST_TARGET=plain）: 素の PostgreSQL に一時 DB を作り、shim とマイグレーションを適用する。
 *   ADMIN_DATABASE_URL はスーパーユーザーで接続できる URL。
 * - DB_TEST_TARGET=supabase: `supabase start` / `supabase db reset` 済みのローカル環境に対して実行する。
 *   ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   API_DATABASE_URL=postgresql://authenticator:postgres@127.0.0.1:54322/postgres
 */
export const target = (process.env.DB_TEST_TARGET ?? 'plain') as 'plain' | 'supabase';

const serverUrl =
  process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
export const testDbName = process.env.TEST_DB_NAME ?? 'thippo_test';

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export const serverAdminUrl = serverUrl;
export const adminUrl = target === 'plain' ? withDb(serverUrl, testDbName) : serverUrl;
export const apiUrl =
  process.env.API_DATABASE_URL ??
  (() => {
    const u = new URL(adminUrl);
    u.username = 'authenticator';
    u.password = 'authenticator';
    return u.toString();
  })();
