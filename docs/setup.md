# セットアップ状態

## 完了済み

### Supabase
| 項目 | 値 |
|---|---|
| プロジェクト | `ai-hackathon` (`vdldxajmloppsyfqwwju`) |
| リージョン | Northeast Asia (Tokyo) `ap-northeast-1` |
| APIキー形式 | 新形式（`sb_publishable_...` / `sb_secret_...`） |
| Data API | 有効 |
| Automatically expose new tables | **無効**（`jobs` / `agent_runs` / `private` を PostgREST に晒さないため） |
| Enable automatic RLS | 有効 |
| 拡張機能 | `vector` `pgcrypto` `citext` `pg_cron` `pg_net` |
| Auth Hook | `public.custom_access_token_hook` を **有効化済み**（JWTに `tenant_id` / `app_role` を注入） |

スキーマ適用結果: **36テーブル / 全てRLS有効 / 35ポリシー / cron 4本 / 関数 12個**

ポリシーを持たない（= service role 専用、authenticated からは0行に見える）テーブル:
`agent_runs` `agent_run_attempts` `guard_events` `audit_logs` `ai_budget_ledger`
`jobs` `jobs_dead` `workflow_runs` `workflow_transitions` `channel_link_tokens` `model_disables`

### OrcaRouter
| 項目 | 値 |
|---|---|
| ウォレット残高 | $0.00 |
| プロモーションクレジット | **$20.00**（全モデル対象 / 期限 **2026-09-26**） |
| dev階層の主モデル | `google/gemini-2.5-flash-lite` |
| dev階層の連鎖 | gemini-2.5-flash-lite → gpt-oss-120b → glm-5.3-flash（3社に分散） |
| 埋め込み | `openai/text-embedding-3-small` / 1536次元 |
| 日次上限 | `AI_DAILY_BUDGET_USD=1.00` |

選定根拠は `docs/m0-spike-results.md`。要点は「**額面単価ではなく実測で選ぶ**。
推論トークン量が支配的で、額面最安の qwen3.7-flash は実測2.4倍高く、しかも採点を誤った」。

## 残っているセットアップ

### 1. GitHub リポジトリ（ユーザー作業）
`git init` 済み（`create-next-app` が実行）。commit / push は運用ルール通りユーザーが行う。

### 2. Vercel プロジェクト（GitHub push 後）
環境変数は `.env.local` の内容をそのまま登録する。`DATABASE_URL` は
マイグレーション用なので Vercel には不要。

**⚠️ Deployment Protection を `/api/internal/*` で無効化またはバイパスすること。**
しないと本番では動きプレビューで全滅する。

### 3. worker の起動設定（Vercel デプロイ後）
デプロイURLが決まったら SQL Editor で実行する:

```sql
insert into private.app_config (key, value) values
  ('worker_url',    'https://<your-app>.vercel.app/api/internal/worker/tick'),
  ('worker_secret', '<.env.local の WORKER_SECRET と同じ値>')
on conflict (key) do update set value = excluded.value;
```

`worker-tick` cron は10秒ごとに動いているが、この2行が入るまで
`private.tick_worker()` が何もせず戻るので、ログは汚れない。

### 4. OrcaRouter Guardrails / Firewall（ダッシュボード）
アプリ層の Safety 実装（M5）と二重化する。APIキーに紐付ける。
- Guardrails: PII / シークレット / プロンプトインジェクション / 脱獄 / 毒性 / 自傷
- Firewall: ツール許可リスト、egress制限、pending approval

### 5. LINE 公式アカウント（M16）
それまで `.env.local` の `LINE_*` は空でよい。
`isLineConfigured` が false を返し、UIは「準備中」表示になる。

## よく使うコマンド

```bash
npm run db:push     # マイグレーション適用（未適用のものだけ）
npm run db:types    # DBから TypeScript 型を再生成
npm run test        # ゴールデンテスト
npm run dev         # 開発サーバー
npx tsx scripts/db-verify.ts        # スキーマ・RLS・cron の確認
./scripts/spike-orcarouter.sh       # OrcaRouter の実挙動を再測定
```

### マイグレーションの規約
- **適用済みファイルは編集しない。** `db-push` が sha256 で検出して失敗する。
  変更したい場合は新しい番号のファイルを足す
- 1ファイル = 1トランザクション。途中失敗で中途半端な状態を残さない
