# 依頼：thippo（遊休スペースの時間貸しマーケットプレイス）を本番運用できる状態で実装する

このファイルは仕様書です。リポジトリのルートに `SPEC.md` として置き、実装中は常にこれを参照すること。

## 0. 進め方のルール

- 「11. フェーズ」の順に実装する。各フェーズが終わるたびに作業を止め、変更内容・動作確認の手順・未解決の点を報告すること。
- 仕様が曖昧な点、または仕様どうしが矛盾する点を見つけたら、推測で実装せず質問すること。`TODO(要確認)` を残したまま次のフェーズに進まないこと。
- 金額計算・返金判定・予約の重複防止・権限チェックは、必ずサーバー側またはDB側で行う。クライアントから送られた金額・手数料・ロールは信用しない。
- 秘密情報（Stripe のシークレットキー、Webhook の署名シークレット、Supabase の service role key など）は環境変数で扱い、クライアント側のコードやリポジトリに含めない。`.env.example` にはキー名だけを書く。
- 日時は DB に `timestamptz` で保存し、画面の表示と入力は Asia/Tokyo で行う。
- すべてのお金の計算は整数（円）で行い、浮動小数点の誤差が出る処理をしない。

## 1. サービス概要

企業などが持つ空き会議室・空き部屋を、30分単位で貸し出せる予約型マーケットプレイス。
一般的なECサイトと同じ流れ（一覧 → 詳細 → 予約カゴ → 購入手続き → 完了 → マイページ）で予約できる。

登場するロールは3つ。

| ロール | 使うサイト | ドメイン（仮） |
|---|---|---|
| 利用者（guest） | 利用者サイト | `thippo.example` |
| 貸出主（host） | 貸出主センター | `host.thippo.example` |
| 運営（admin） | 運営管理 | `admin.thippo.example` |

ドメインは仮置き。本番のドメインは環境変数で切り替えられるようにする。

## 2. 技術スタックと構成

- monorepo（pnpm workspaces）
  - `apps/guest`：利用者サイト（Next.js App Router, TypeScript）
  - `apps/host`：貸出主センター（同上）
  - `apps/admin`：運営管理（同上）
  - `packages/core`：料金計算・返金判定・枠の計算などの純粋関数と型。3つのアプリと DB 関数のテストから共通で使う
  - `packages/ui`：共通のUIコンポーネント
  - `packages/db`：Supabase の型定義（`supabase gen types` の出力）とクライアント生成
  - `supabase/`：マイグレーション、RLS、DB関数、シード
- DB・認証・ストレージ：Supabase（1つのプロジェクトを3アプリで共有）
- 決済：Stripe Connect（Express アカウント、Destination charges）
- メール送信：Resend（送信処理は `packages/core` のインターフェース経由にし、差し替え可能にする）
- ホスティング：Vercel（3アプリを別プロジェクトとしてデプロイ）
- 定期実行：Supabase の pg_cron、または Vercel Cron
- エラー監視：Sentry
- テスト：Vitest（単体）、Playwright（E2E）、RLS のテスト（pgTAP または Supabase のテストヘルパー）
- 環境：development（ローカル）、staging、production の3つ。staging と development は Stripe のテストモードを使う

## 3. 権限とセキュリティ

### 3.1 ロール

- `profiles.role` に `guest` / `host` / `admin` のいずれかを持たせる。
- 権限は RLS とサーバー側の処理で制御する。画面で表示を隠すだけの制御は不可。
- 各アプリの middleware で、そのアプリに入れるロールかどうかを確認する。ロールが合わない場合はログイン画面に戻す。
- 貸出主のユーザーは `host_members` テーブルで企業（hosts）に紐づける。1つの企業に複数の担当者がいてよい。

### 3.2 運営管理のアクセス制限（必須）

- 運営管理は `admin.` サブドメインで別デプロイし、利用者サイトや貸出主センターからリンクしない。
- 運営アカウントは2段階認証（Supabase Auth の TOTP）を必須にする。2段階認証を設定していない admin はどの画面も開けない。
- 運営管理の前段に Cloudflare Access（または Vercel の Password Protection / Trusted IPs）を置き、許可したメールアドレスまたはIPアドレス以外からは画面自体を表示できないようにする。設定手順を `docs/admin-access.md` に書く。
- admin ロールの付与は、どの画面からもできないようにする。付与は DB 上で直接のみ行い、その手順を `docs/admin-access.md` に書く。
- 運営の操作（本人確認の承認・却下、アカウント停止、スペースの公開停止、手動返金など）は、すべて `audit_logs` に記録する。

### 3.3 共通

- すべてのフォームとAPIに入力検証（zod）を入れる。
- ログイン・会員登録・パスワード再設定・キャンセルのAPIにはレート制限をかける。
- 本人確認書類のストレージは非公開バケットにし、閲覧は本人と admin のみ。admin が閲覧するときは有効期限の短い署名付きURLを発行し、閲覧したことを `audit_logs` に記録する。
- 退会したユーザーの本人確認書類は、法令上の保存期間を過ぎたら削除する仕組みを用意する（期間は `TODO(要確認)` として設定値にする）。

## 4. データモデル

最低限のテーブル。必要なカラムやインデックスは追加してよい。削除は論理削除（`deleted_at`）を基本とする。

- `profiles`：id（auth.users と同じ）, role, display_name, email, phone, identity_status（unsubmitted / pending / approved / rejected）, status（active / suspended）
- `identity_documents`：id, user_id, storage_path, status, reviewed_by, reviewed_at, reject_reason
- `hosts`：id, company_name, invoice_registration_number（適格請求書発行事業者の登録番号）, status（applied / active / suspended）, stripe_account_id, charges_enabled, payouts_enabled
- `host_members`：host_id, user_id
- `host_applications`：貸出主の掲載申込（会社名、担当者、連絡先、所在地、備考、審査ステータス）
- `spaces`：id, host_id, name, description, address, area, capacity, price_per_30min, min_slots（最低利用枠数）, status（draft / published / suspended）
- `space_photos`：space_id, storage_path, sort_order
- `availability_rules`：space_id, weekday, open_time, close_time
- `closures`：space_id, date
- `carts` / `cart_items`：ログイン中の利用者の予約カゴ。未ログインの間はブラウザ側に保持し、ログイン時にサーバーへ移す
- `orders`：id, order_number（`T-` から始まる連番。推測しにくいIDとは別に持つ）, guest_id, host_id, total, status（pending / paid / expired / failed）, stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, created_at
- `bookings`：id, order_id, space_id, guest_id, period tstzrange, slots, total, status（pending / confirmed / cancelled / completed / no_show）, cancelled_by（guest / host / admin / null）, cancelled_at, cancel_policy（full / half / none）
- `booking_fees`：booking_id, hours, platform_fee_excl_tax, platform_fee_tax, stripe_fee_estimated, application_fee（予約1件ごとの内訳。料金改定後も過去の数字が変わらないよう、確定時の値を保存する）
- `refunds`：id, booking_id, stripe_refund_id, refund_amount, stripe_transfer_reversal_id, transfer_reversal_amount, policy, created_by, created_at
- `cancel_events`：user_id, booking_id, created_at（キャンセル回数の判定に使う）
- `monthly_statements`：host_id, month, gross, platform_fee_excl_tax, platform_fee_tax, stripe_fee, net, pdf_path, issued_at
- `stripe_events`：event_id（ユニーク）, type, payload, processed_at（Webhook の重複処理防止）
- `notifications`：送信したメールの記録
- `audit_logs`：actor_id, action, target_table, target_id, payload, created_at

### 4.1 ダブルブッキングの防止（必須）

`bookings` に btree_gist を使った排他制約を付ける。

```sql
exclude using gist (space_id with =, period with &&)
  where (status in ('pending','confirmed'))
```

- 期間の開始と終了が30分刻みであることを CHECK 制約でも保証する。
- 同時に同じ枠を購入しようとした場合、後の購入は DB の制約で失敗させ、利用者には「他の方が先に予約しました」と表示して予約カゴに戻す。

## 5. 料金・手数料（`packages/core` に実装）

- 予約は30分単位。利用料金 = 30分あたりの料金 × 枠数。
- 運営手数料：1時間ごとに220円（税抜200円＋消費税20円）。30分の端数は1時間に切り上げる。`hours = ceil(slots / 2)`
- Stripe 決済手数料は貸出主が負担する。予約1件ごとに `ceil(利用料金 × 3.6%)` を見込み額とする。
- 予約1件の application fee = 税抜手数料 + 消費税 + Stripe 手数料の見込み額
- 注文の application_fee_amount = 注文に含まれる予約の application fee の合計
- 実際の Stripe 手数料は balance_transaction から取得して保存し、見込み額との差額を運営管理に表示する。差額は運営が吸収する。
- 料率・単価・下限などの数値は `packages/core` の設定値として1か所にまとめる。
- 貸出主が設定できる料金には下限を設け、半額キャンセル時でも貸出主の手取りがマイナスにならないようにする（下限の計算式を `packages/core` に実装し、そのテストを書く）。

## 6. 利用者サイト（apps/guest）

一般的なECサイトと同じ構成にする。

- **トップ・一覧**：キーワード（エリア、スペース名）、人数、日付で検索。公開中（published）で、貸出主が active のスペースだけを表示する
- **スペース詳細**：写真、説明、設備、所在地、料金、キャンセル規定、日付ごとの30分単位の空き枠。開始枠と終了枠をクリックして範囲を選び、予約カゴに入れる。最低利用枠数（min_slots）未満は選べない
- **予約カゴ**：内容の確認と削除。カゴに入れただけでは枠は確保しない。予約できなくなった枠は警告を出し、購入手続きに進めない
  - 1つの注文に含められるのは同じ貸出主のスペースだけにする（Destination charges では1回の決済の送金先が1つのため）。別の貸出主のスペースをカゴに入れようとした場合は、「予約カゴを分けて購入する必要があります」と表示し、先に今のカゴを購入するか入れ替えるかを選ばせる
- **購入手続き**：ログインと本人確認の承認が必要。未ログインならログインまたは会員登録に誘導し、完了後に購入手続きへ戻す。支払いは Stripe Payment Element を使う。利用規約とキャンセル規定への同意チェックを必須にする
- **注文完了**：注文番号と予約内容を表示し、確認メールを送る
- **マイページ**：会員情報の編集、本人確認書類の提出と状態の表示、予約履歴（注文単位）、キャンセル、領収書の表示
- **会員登録・ログイン**：メールアドレスとパスワード、メールアドレスの確認、パスワード再設定。Google ログインは後から追加できる構成にしておく
- **静的ページ**：利用規約、プライバシーポリシー、特定商取引法に基づく表記、キャンセル規定、よくある質問、お問い合わせフォーム。本文は仮の文章にし、`TODO(要確認)` を付けて運営が差し替えられるようにする
- **貸出主向けの案内ページ**：掲載の申込フォーム（`host_applications` に保存し、運営に通知する）

## 7. 決済フロー

1. 購入手続きで「支払う」を押したら、サーバー側で次を1つのトランザクションで行う。
   - 予約カゴの内容を再計算する（金額はサーバー側の料金で計算し直す）
   - `orders`（pending）と `bookings`（pending）を作成する。排他制約に当たった場合はエラーを返す
   - `booking_fees` を保存する
2. PaymentIntent を作成する（Destination charges、`transfer_data.destination` = 貸出主の Stripe アカウント、`application_fee_amount` = 注文の application fee の合計、metadata に order_id）。
3. Webhook `payment_intent.succeeded` を受け取ったら、order を paid、bookings を confirmed にし、charge_id と transfer_id を保存する。確認メールを利用者と貸出主に送る。
4. pending のまま15分経った注文は、定期実行で expired にして枠を解放する。
5. Webhook は署名を検証し、`stripe_events` で同じイベントを重複して処理しないようにする。
6. すべての Stripe API 呼び出しに idempotencyKey を付ける。
7. 貸出主の入金は Stripe の payout schedule を月次に設定して行う。
8. 予約を受け付けるのは、現在時刻から30日先までとする（設定値）。月次入金の後にキャンセルされて貸出主の残高がマイナスになるリスクを抑えるため。
9. 利用終了時刻を過ぎた confirmed の予約は、定期実行で completed にする。

## 8. キャンセル・返金（`packages/core` と DB 関数に実装）

キャンセル操作時刻を now、利用開始時刻を start とする。判定は上から順に行う。

| 条件 | 利用者への返金 | 運営手数料 | Stripe手数料 |
|---|---|---|---|
| now >= start（利用開始後） | 返金なし | 1時間220円 | 貸出主負担 |
| 過去24時間以内の利用者自身のキャンセルがすでに5回以上 | 返金なし | 1時間220円 | 貸出主負担 |
| now < start − 2時間 | 全額 | 0円 | 運営負担 |
| start − 2時間 <= now < start | 半額（1円未満は切り捨て） | 1時間110円（税抜100円＋税10円） | 貸出主負担 |

- 「過去24時間」は now から遡る移動窓で数える（日付の境界では数えない）。
- 無断キャンセル（no_show）は返金なし。キャンセル回数には含めない。
- 貸出主側・運営側からのキャンセルは常に全額返金とし、Stripe 手数料は運営が負担する。利用者のキャンセル回数には含めない。
- 回数の確認、判定、キャンセルの記録は1つの DB 関数（RPC）の中で、利用者単位の advisory lock を取ったうえで1つのトランザクションとして行う。同時に実行されても判定が崩れないようにする。
- キャンセル画面では、確定前に返金額と「過去24時間で◯回目のキャンセルです。6回目以降は返金されません」を表示する。

### 8.1 Stripe での返金処理

1つの注文に複数の予約が含まれることがあるため、比例配分に任せず、差し戻し額を必ず明示的に指定する。

- 利用者への返金：`refunds.create`（amount = 返金額、`reverse_transfer: false`、`refund_application_fee: false`）
- 貸出主からの差し戻し：`transfers.createReversal`（amount は下記）
  - 全額返金：その予約の利用料金 − その予約の application fee
  - 半額返金：返金額 − 110 × hours
- 返金額が0円（返金なし）の場合は Stripe の処理を行わない。
- 予約のステータスは Webhook（`charge.refunded`）を受け取ってから確定する。返金処理が失敗した場合は運営管理に表示し、運営が再実行できるようにする。

## 9. 貸出主センター（apps/host）

- **ログイン**：運営が掲載申込を承認すると、担当者に招待メールが届き、パスワードを設定してログインできる
- **初回設定**：会社情報、適格請求書発行事業者の登録番号（任意）、Stripe Connect Express のオンボーディング。オンボーディングが完了するまでスペースを公開できない
- **ダッシュボード**：これからの予約、今月の売上見込み
- **予約管理**：予約一覧（日付・スペース・状態で絞り込み）、詳細、貸出主都合のキャンセル（理由の入力を必須にする）、無断キャンセルの記録
- **スペース管理**：登録・編集・写真・営業時間・休業日・最低利用枠数・料金。公開・非公開の切り替え。料金を変更しても確定済みの予約の金額は変わらない
- **売上・振込**：月別の明細（利用者のお支払い合計、運営手数料の税抜・消費税、決済手数料、振込額）と予約ごとの内訳。運営手数料の請求書（適格請求書）PDF のダウンロード
- **アカウント設定**：会社情報、担当者の追加、Stripe の管理画面（Express ダッシュボード）へのリンク

## 10. 運営管理（apps/admin）

- **ダッシュボード**：今月の予約件数、利用総額、運営手数料（税抜）、預かり消費税、全額返金による決済手数料の負担、実質収入、要対応の件数
- **本人確認の審査**：書類の閲覧、承認、却下（理由を入力し、利用者にメールで通知する）
- **掲載申込の審査**：承認すると hosts を作成し、担当者に招待メールを送る
- **貸出主・スペース**：一覧、アカウント停止（停止するとそのスペースはすべて非公開になる）、スペースの公開停止
- **利用者**：一覧、検索、アカウント停止
- **予約・決済**：注文と予約の一覧・検索、予約ごとの application fee・返金額・差し戻し額・貸出主の手取り、Stripe の決済画面へのリンク、失敗した返金の再実行、運営判断での全額返金
- **月次集計**：貸出主ごとの集計、月次明細と請求書 PDF の発行、Stripe 手数料の見込み額と実額の差額
- **キャンセル監視**：過去30日・過去24時間のキャンセル回数が多い利用者の一覧
- **操作ログ**：audit_logs の閲覧と検索

## 11. 定期実行

- 15分以上 pending のままの注文を expired にする（5分ごと）
- 利用終了時刻を過ぎた予約を completed にする（15分ごと）
- 利用前日のリマインドメールを送る（毎日）
- 前月分の月次明細と請求書 PDF を作成し、貸出主に通知する（毎月1日）
- 実際の Stripe 手数料を取得して保存する（毎時）

## 12. メール通知

会員登録の確認、パスワード再設定、本人確認の承認・却下、予約確定（利用者・貸出主）、キャンセル（利用者・貸出主）、返金完了、利用前日のリマインド、掲載申込の受付と承認、月次明細の発行。
文面はテンプレートとして1か所にまとめ、運営が後から修正しやすくする。

## 13. フェーズ

1. monorepo の構成、CI（lint・型チェック・テスト）、Supabase のスキーマ・RLS・排他制約、`packages/core`（料金計算・返金判定・下限料金・枠の計算）とそのテスト
2. 認証（3アプリ共通）、ロール、middleware、運営の2段階認証、audit_logs
3. 利用者の会員登録・本人確認の提出と、運営での審査
4. 掲載申込、貸出主の招待、Stripe Connect のオンボーディング、スペース管理、空き枠の計算
5. 利用者サイトの一覧・詳細・予約カゴ
6. 購入手続き、決済、Webhook、注文完了、確認メール
7. キャンセルと返金
8. 貸出主センターの予約管理・売上・請求書 PDF
9. 運営管理の残りの画面
10. 定期実行、リマインドメール、静的ページ
11. staging 環境へのデプロイ、E2E テスト、Sentry、本番リリースのチェックリスト（`docs/release-checklist.md`）

## 14. 必須のテスト

- 料金計算：30分・60分・90分・120分で hours と各手数料が正しいこと。複数の予約を含む注文の application fee が予約ごとの合計と一致すること
- 返金判定：start − 2時間ちょうど、start ちょうど、過去24時間のキャンセル回数が4回・5回の境界
- 差し戻し額：全額・半額のそれぞれで、貸出主の手取りと運営の手取りが仕様どおりになること
- 料金の下限：下限ちょうどの料金で半額キャンセルしても、貸出主の手取りがマイナスにならないこと
- 同じ時間帯への同時購入が DB の制約で拒否されること
- 同時キャンセルでキャンセル回数の判定が崩れないこと
- RLS：利用者が他人の予約・本人確認書類を読めないこと、貸出主が他社の予約を読めないこと、admin 以外が運営用のデータに書き込めないこと
- Webhook：同じイベントを2回受け取っても二重に処理されないこと
- E2E：会員登録 → 本人確認 → 承認 → 予約 → 支払い（Stripe のテストカード）→ キャンセル → 返金 の一連の流れ

## 15. 今回は対象外

アフィリエイト機能、掲載料の課金、eKYC の外部サービス連携、レビュー機能、クーポン、複数の貸出主にまたがる注文、スマートフォンアプリ

## 16. 運営が本番前に決めること（実装側では `TODO(要確認)` として残す）

- 本番のドメイン
- 利用規約、プライバシーポリシー、特定商取引法に基づく表記の本文
- 本人確認書類の保存期間
- 運営の適格請求書発行事業者の登録番号
- お問い合わせ先のメールアドレス
