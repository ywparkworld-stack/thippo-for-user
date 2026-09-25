function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for E2E tests (see e2e/README.md)`);
  return v;
}

export const urls = {
  guest: process.env.NEXT_PUBLIC_GUEST_URL ?? 'http://localhost:3000',
  host: process.env.NEXT_PUBLIC_HOST_URL ?? 'http://localhost:3001',
  admin: process.env.ADMIN_URL ?? 'http://localhost:3002',
};

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get serviceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  /** スーパーユーザー（postgres）での接続。admin ロールの付与など、DB への直接操作に使う */
  get databaseUrl() {
    return required('E2E_DATABASE_URL');
  },
  get mailpitUrl() {
    return process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
  },
};
