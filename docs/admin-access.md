# 運営管理（admin）のアクセス制限と運営アカウントの管理

運営管理は、次の4段階で守っている。

| 段階                  | 内容                                                                                                            | 実装・設定場所                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1. 前段のアクセス制限 | 許可したメールアドレス・IP アドレス以外は画面そのものを表示しない                                               | Cloudflare Access（または Vercel の Password Protection / Trusted IPs）と `apps/admin/proxy.ts` |
| 2. ログイン           | admin ロール・状態 active のアカウントだけがログインできる                                                      | `packages/auth`（proxy と各ページの `requireAccess`）                                           |
| 3. 2段階認証          | TOTP を登録・入力するまで、2段階認証の画面以外はどの画面も開けない                                              | `packages/core/src/access.ts`、`apps/admin/app/mfa`                                             |
| 4. DB                 | 運営用データは `role = admin`・`status = active`・JWT の `aal = aal2` のときだけ読める。書き込みは RPC 経由だけ | `public.is_admin()` と RLS                                                                      |

運営管理は `admin.` サブドメインに別の Vercel プロジェクトとしてデプロイする。利用者サイト・貸出主センターからはリンクしない。
検索エンジンに載らないよう `X-Robots-Tag: noindex, nofollow` と `robots` メタタグを付けている。

---

## 1. 前段のアクセス制限

運営管理アプリは環境変数 `ADMIN_ACCESS_MODE` で前段の方式を指定する。**未設定だとすべてのリクエストを 403 にする**（設定漏れで公開されないようにするため）。

| 値           | 使う場面                                               | アプリ側の確認                                                                                      |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `cloudflare` | 本番・staging（推奨）                                  | Cloudflare Access が付ける JWT（`Cf-Access-Jwt-Assertion`）の署名・発行元・宛先・有効期限を検証する |
| `vercel`     | Vercel の Password Protection / Trusted IPs を使う場合 | なし（Vercel のエッジで拒否される）                                                                 |
| `none`       | ローカル開発・E2E のみ                                 | なし。`VERCEL_ENV=production` では拒否する                                                          |

### 1-A. Cloudflare Access（推奨）

1. **DNS**: `admin.<本番ドメイン>` を Cloudflare の DNS で管理し、Vercel に向ける CNAME（`cname.vercel-dns.com`）を**プロキシ有効（オレンジの雲）**で登録する。
   Vercel のプロジェクト設定 > Domains に同じドメインを追加する。
2. **Access アプリケーション**: Cloudflare Zero Trust > Access > Applications > Add an application > Self-hosted
   - Application domain: `admin.<本番ドメイン>`（パスは空欄にして全体を保護する）
   - Session duration: 8 hours 程度
   - Identity providers: One-time PIN（メールに届くコード）または会社の IdP（Google Workspace など）
3. **ポリシー**（Action: Allow）
   - Include: _Emails_ に運営メンバーのメールアドレスを列挙する（またはメールドメイン）
   - 必要に応じて Require: _IP ranges_ にオフィスの IP を指定する
   - 上記以外は自動的に拒否される
4. **アプリ側の検証を有効にする**: 作成したアプリケーションの Overview にある _Application Audience (AUD) Tag_ を控え、Vercel（admin プロジェクト）の環境変数に設定する。

   ```
   ADMIN_ACCESS_MODE=cloudflare
   CF_ACCESS_TEAM_DOMAIN=<チーム名>.cloudflareaccess.com
   CF_ACCESS_AUD=<AUD Tag>
   ```

   これにより、Cloudflare を経由しないアクセス（`*.vercel.app` の URL を直接開くなど）は 403 になる。

5. **Vercel 側の直接アクセスも塞ぐ**: admin プロジェクトの Settings > Deployment Protection で _Vercel Authentication_ を _Standard Protection_ 以上にする（プレビューと `*.vercel.app` の URL を保護する）。
6. **確認**
   - 許可していないメールアドレスで `https://admin.<本番ドメイン>/login` を開き、Cloudflare の画面で止まること
   - `https://<admin プロジェクト>.vercel.app/login` を開き、403 または Vercel の認証画面になること
   - 許可したメールアドレスで開くと、thippo のログイン画面が表示されること

### 1-B. Vercel の Password Protection / Trusted IPs を使う場合

Cloudflare を使えない場合の代替。Trusted IPs は Enterprise プラン、Password Protection は Pro プランの追加機能が必要。

1. admin プロジェクトの Settings > Deployment Protection を開く
2. _Trusted IPs_ に運営の IP アドレス（範囲）を登録し、対象を _All Deployments_（本番を含む）にする。
   または _Password Protection_ を有効にし、対象を _All Deployments_ にする
3. 環境変数 `ADMIN_ACCESS_MODE=vercel` を設定する
4. 許可していない IP（またはパスワードなし）で本番の URL を開き、Vercel の画面で止まることを確認する

---

## 2. 運営アカウントの作成と admin ロールの付与

admin ロールは**どの画面からも付与できない**。アプリのサーバー（service role）からも付与・剥奪できないよう、
DB のトリガー `public.guard_admin_role` が「DB に直接接続したセッション（`postgres` / `supabase_admin`）」以外からの変更を拒否する。

1. Supabase ダッシュボード > Authentication > Users > _Add user_ > _Create new user_
   - メールアドレスとパスワードを入力し、_Auto Confirm User_ を有効にする
   - パスワードは本人に安全な方法で伝え、初回ログイン後に「パスワードをお忘れの方」から変更してもらう
2. Supabase ダッシュボード > SQL Editor で実行する（SQL Editor は `postgres` として実行される）

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'ops-member@example.com'
   returning id, email, role, status;

   -- 誰が付与したかを操作ログに残す
   select public.write_audit_log(
     null, 'admin.role_grant', 'profiles',
     (select id::text from public.profiles where email = 'ops-member@example.com'),
     jsonb_build_object('granted_by', '<作業者の名前>', 'ticket', '<申請番号など>')
   );
   ```

3. 前段のアクセス制限（Cloudflare Access のポリシーなど）に本人のメールアドレスを追加する
4. 本人が運営管理にログインすると、2段階認証の登録画面が表示される。Google Authenticator などの認証アプリで QR コードを読み取り、表示されたコードを入力して登録を完了する。
   **アカウントを作成したら、すぐに本人に2段階認証の登録まで済ませてもらうこと**（登録前のアカウントは、パスワードだけで2段階認証を登録できてしまうため）。

## 3. admin ロールの剥奪・アカウントの停止

SQL Editor で実行する。

```sql
-- admin ロールを外す（guest に戻す）
update public.profiles set role = 'guest' where email = 'ex-member@example.com';

-- または停止する（ログインできなくなる。運営用データも即座に読めなくなる）
update public.profiles set status = 'suspended' where email = 'ex-member@example.com';

-- ログイン中のセッションをすべて無効にする
delete from auth.sessions
where user_id = (select id from public.profiles where email = 'ex-member@example.com');

select public.write_audit_log(
  null, 'admin.role_revoke', 'profiles',
  (select id::text from public.profiles where email = 'ex-member@example.com'),
  jsonb_build_object('revoked_by', '<作業者の名前>')
);
```

あわせて前段のアクセス制限からメールアドレスを削除する。

## 4. 2段階認証のリセット（端末の紛失など）

本人確認をしたうえで、SQL Editor で登録済みの2段階認証を削除する。次回ログイン時に登録画面が表示される。

```sql
delete from auth.mfa_factors
where user_id = (select id from public.profiles where email = 'ops-member@example.com');

delete from auth.sessions
where user_id = (select id from public.profiles where email = 'ops-member@example.com');

select public.write_audit_log(
  null, 'admin.mfa_reset', 'profiles',
  (select id::text from public.profiles where email = 'ops-member@example.com'),
  jsonb_build_object('reset_by', '<作業者の名前>')
);
```

## 5. 操作ログ（audit_logs）

`audit_logs` は追記のみで、DB に直接接続しても更新・削除できない（トリガーで拒否する）。
action は「対象.操作」の形式（例: `identity.approve`）。フェーズ 2 で記録しているもの:

| action                                  | 記録するタイミング                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `admin.login`                           | 運営管理へのログイン（パスワード認証の成功）                                 |
| `admin.login_failed`                    | 運営管理でのログイン失敗（actor なし。メールアドレスのハッシュと IP を記録） |
| `admin.login_denied`                    | admin 以外のアカウント・停止中のアカウントが運営管理にログインしようとした   |
| `admin.mfa_enroll` / `admin.mfa_verify` | 2段階認証の登録・入力の成功                                                  |
| `admin.mfa_failed`                      | 2段階認証のコードの誤り                                                      |
| `admin.logout`                          | ログアウト                                                                   |
| `admin.password_change`                 | パスワードの変更                                                             |

運営の各操作（本人確認の承認・却下、アカウント停止、スペースの公開停止、手動返金など）は、各フェーズで
操作と同じトランザクションの中で記録する（`public.log_admin_action` など）。
