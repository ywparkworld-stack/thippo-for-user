# E2E テスト

Supabase のローカル環境と、ビルドした3アプリに対して Playwright で実行する。CI（`.github/workflows/ci.yml` の `e2e`）でも同じ手順で動かしている。

```sh
supabase start                      # リポジトリのルートで
eval "$(e2e/scripts/supabase-env.sh)"  # アプリと E2E 用の環境変数を設定
pnpm build
pnpm --filter @thippo/e2e test
```

- メールは Mailpit（http://127.0.0.1:54324）で受け取る
- Playwright 同梱のブラウザを使わない場合は `PLAYWRIGHT_CHROMIUM_PATH` にパスを指定する
