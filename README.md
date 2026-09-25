# thippo

遊休スペースの時間貸しマーケットプレイス。仕様は [SPEC.md](./SPEC.md) を参照。

## 構成

```
apps/
  guest/   利用者サイト（Next.js, :3000）
  host/    貸出主センター（Next.js, :3001）
  admin/   運営管理（Next.js, :3002）
packages/
  core/    料金計算・返金判定・下限料金・枠の計算（純粋関数）と設定値
  ui/      共通 UI コンポーネント
  db/      Supabase の型定義（生成物）とクライアント
supabase/
  migrations/  スキーマ・制約・RLS・DB 関数
  tests/       DB のテスト（排他制約・RLS・core とのパリティ）
```

## お金と権限の考え方

- 金額はすべて整数（円）。料率・単価は `packages/core/src/config.ts` に集約し、DB 側の
  `public.pricing_config()` と同じ値であることをテストで確認している。
- ダブルブッキングは `bookings` の排他制約（`bookings_no_overlap`）で防ぐ。期間は CHECK 制約で30分刻みに限定。
- `anon` / `authenticated` には必要なテーブル・列・操作だけを GRANT し、全テーブルで RLS を有効にしている。
  注文・予約・返金・運営用データへの書き込みは、ブラウザからは直接できない（サーバーの service role か、
  権限確認と操作ログを伴う RPC 経由のみ）。
- 運営（admin）として扱うのは `role = admin`・`status = active`・2段階認証済み（JWT の `aal = aal2`）のセッションだけ。
- admin ロールの付与・剥奪は DB に直接接続したセッションでしかできない（トリガー `guard_admin_role`）。

## ローカル開発

必要なもの: Node.js 22、pnpm 10、PostgreSQL 15 以上（DB テスト用）、Supabase CLI（アプリを動かす場合）

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # 単体テスト

# DB テスト: 素の PostgreSQL に一時 DB（thippo_test）を作り、マイグレーションを適用して実行する
ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test:db

# Supabase のローカル環境で DB テストを実行する場合
supabase start && supabase db reset
DB_TEST_TARGET=supabase \
  ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  API_DATABASE_URL=postgresql://authenticator:postgres@127.0.0.1:54322/postgres \
  pnpm test:db
```

### 型定義の再生成

マイグレーションを変更したら `packages/db/src/database.types.ts` を再生成してコミットする（CI で差分を検出する）。

```sh
pnpm --filter @thippo/db gen:types          # supabase start 済みの場合
pnpm test:db && pnpm --filter @thippo/db gen:types:db-url   # Docker がない場合（テスト用 DB から生成）
```
