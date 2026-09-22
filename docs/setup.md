# セットアップ

自分の環境にトイノワを立てるための手順と、構成上の決めごとをまとめます。環境変数の一覧は [.env.example](../.env.example) にあります。

## 1. Supabase

プロジェクトは Northeast Asia (Tokyo) `ap-northeast-1` に作っています。設定で効いてくるのは次の4点です。

| 項目 | 設定 | 理由 |
|---|---|---|
| APIキー形式 | 新形式（`sb_publishable_...` / `sb_secret_...`） | — |
| Data API | 有効 | — |
| Automatically expose new tables | **無効** | `jobs` / `agent_runs` / `private` を PostgREST に晒さないため |
| Enable automatic RLS | 有効 | 新しいテーブルを保護漏れで作らないため |
| 拡張機能 | `vector` `pgcrypto` `citext` `pg_cron` `pg_net` | 埋め込み・定期処理・ワーカー起動に使う |
| Auth Hook | `public.custom_access_token_hook` を有効化 | JWTに `tenant_id` / `app_role` を注入する |

`npm run db:push` を通したあとの状態は **36テーブル / 全てRLS有効 / 35ポリシー / cron 6本 / 関数 12個**です。`npx tsx scripts/db-verify.ts` でスキーマ・RLS・cron をまとめて確認できます。

次のテーブルは**ポリシーを1つも持ちません**。service role 専用で、`authenticated` からは0行に見えるのが正しい状態です。

`agent_runs` `agent_run_attempts` `guard_events` `audit_logs` `ai_budget_ledger`
`jobs` `jobs_dead` `workflow_runs` `workflow_transitions` `channel_link_tokens` `model_disables`

### マイグレーションの規約

- **適用済みファイルは編集しない。** `db-push` が sha256 で検出して失敗します。変えたいときは新しい番号のファイルを足してください。
- 1ファイル = 1トランザクション。途中で失敗しても中途半端な状態を残しません。

## 2. OrcaRouter

| 項目 | 値 |
|---|---|
| dev階層の主モデル | `google/gemini-2.5-flash-lite` |
| dev階層の連鎖 | gemini-2.5-flash-lite → gpt-oss-120b → deepseek-v4.1-flash（3社に分散） |
| 埋め込み | `openai/text-embedding-3-small` / 1536次元 |
| 日次上限 | `AI_DAILY_BUDGET_USD=1.00`（APIキー側にも別途クォータを設定） |

モデルをこう並べた根拠は [開発記事](qiita-article.md) の6章にあります。要点は「**額面単価ではなく実測で選ぶ**」です。額面最安の `qwen3.7-flash` は推論トークンが支配的で実測2.4倍高く、しかも誤答を正解と判定しました。

コンソール側では Guardrails を併用しています（PII・シークレット・プロンプトインジェクション・脱獄・毒性・自傷）。アプリ層の検査と二重化する構成で、APIキーに紐付けます。

## 3. Vercel

`.env.local` の内容をそのまま環境変数に登録します。`DATABASE_URL` はマイグレーション適用用なので Vercel には不要です。

> **Deployment Protection を `/api/internal/*` で無効化またはバイパスしてください。**
> これをしないと、本番では動くのにプレビューで全滅します。

公開URLについても一点あります。Deployment Protection が `all_except_custom_domains` の場合、`vercel alias set` でエイリアスを張っただけでは SSO で302になります。`vercel domains add <name>.vercel.app <project>` でプロジェクトのドメインとして登録して初めて公開状態になります。

## 4. ワーカーの起動設定

デプロイURLが決まったら実行します。

```bash
npm run db:worker -- --url=https://<your-app>.vercel.app
```

手で入れる場合は SQL Editor で同じことをします。

```sql
insert into private.app_config (key, value) values
  ('worker_url',    'https://<your-app>.vercel.app/api/internal/worker/tick'),
  ('worker_secret', '<.env.local の WORKER_SECRET と同じ値>')
on conflict (key) do update set value = excluded.value;
```

`worker-tick` cron は10秒ごとに動いていますが、この2行が入るまで `private.tick_worker()` は何もせずに戻ります。設定前でもログは汚れません。

## よく使うコマンド

```bash
npm run db:push     # マイグレーション適用（未適用のものだけ）
npm run db:types    # DBから TypeScript 型を再生成
npm run dev         # 開発サーバー
npm test            # ゴールデンテストを含む全体
npx tsx scripts/db-verify.ts   # スキーマ・RLS・cron の確認
```

検証コマンドの使い分けは [機能仕様とモデル設定](feature-guide.md) を参照してください。
