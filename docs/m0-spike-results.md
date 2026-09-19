# M0 スパイク結果（2026-09-19 実測）

`scripts/spike-orcarouter.sh` の実行結果。ドキュメントの記述と実挙動が食い違う箇所があるため、
実装はこちらを正とする。

## ✅ spike 2+3: `orcarouter/free` とヘッダ

```
HTTP/2 200
x-orca-resolved-model: deepseek/deepseek-v4-flash-free
x-orca-router: free
x-orca-request-id: 2026...
```

判明したこと:

- **`x-orca-fallback-level` / `x-orca-fallback-model` は成功時に「そもそも出ない」**
  （`0` が返るのではなく、ヘッダ自体が存在しない）。
  → `fallback_count` は「ヘッダの有無」で判定する。`parseInt(null)` で NaN にしないこと。
- **`usage.cost_usd` は無料モデルでは返らない**。`X-OrcaRouter-Include-Cost: true` を
  付けても `usage` は `{prompt_tokens, completion_tokens, total_tokens, ...}` のみ。
  → コストが取れない場合に 0 として扱い、`estimated_cost_usd` を null にしない。
- `completion_tokens_details.reasoning_tokens` が返る（推論モデル）。
  「1+1は?」に 43 completion tokens のうち 41 が reasoning。
  → **無料/安価モデルは推論トークンを大量に吐く**。`max_tokens` を絞りすぎると
    本文が空になる。評価系は余裕を持たせること。

## ✅ spike 4a: `response_format: json_schema` (strict: true)

**動作した。** 無料の deepseek-v4-flash でも正しいJSONを返した:

```json
{"correct":false,"misconception":"傾きとy切片を混同している"}
```

→ 「OrcaRouter経由では json_schema strict が400になる」という事前情報は**誤り**だった
  （それは自己ホスト版 OrcaRouter-Lite の issue）。
  json_schema を第一手段にしてよい。ただし Anthropic 系モデルに解決された場合は
  非対応なので、**Zod検証＋修復1回＋ルールベース縮退の梯子は残す**。

## ❌ spike 4b: tool-calling → `free_quota_exhausted`

```
HTTP/2 402
{"code":"free_quota_exhausted",
 "message":"your orcarouter/free allowance is used up ...",
 "metadata":{"reason":"err_free_used"},
 "type":"insufficient_quota"}
```

**`orcarouter/free` の無料枠は 2リクエストで枯渇した。**

コンソールで確認した口座状態:

| 項目 | 値 |
|---|---|
| ウォレット残高 | $0.00 |
| プロモーションクレジット | **$20.00（クーポン・全モデル対象）** |
| プロモの有効期限 | **2026/09/26** |
| 今月の消費 | < $0.01 |

`GET /api/free-package/public` のティア表は `min_paid_usd: 0 → rpm 10, rpd 50` だが、
実際には課金実績$0の口座に `orcarouter/free` の割当はほぼ無い
（各モデルの `initial_calls` が `0`）。

→ **「開発は無料モデル」という方針は `orcarouter/free` では実現できない。**
  代わりに「プロモクレジットで安価モデルを使う」を dev 階層とする（§下記）。

## ✅ spike 5: `/v1/embeddings`

```
HTTP/2 200
model=text-embedding-3-small  dims=1536
```

**動作した。** ドキュメントに記載が無いだけで、OpenAI互換の embeddings は使える。

→ プランの「pgvector は使えないかもしれない」という前提は解消。
  `vector(1536)` のまま進めてよい。埋め込みも OrcaRouter のコスト計測に載る。
  （なお、この呼び出しは有料モデルであり成功した = プロモクレジットが効いている）

## ⏸ spike 6: `pg_net` → Vercel

Vercel へのデプロイがまだ無いため未実施。M1 完了後に行う。

## 実装への反映

1. `FAILOVER_MODELS` の free 階層を `orcarouter/free` から**安価な実モデル**へ変更する
2. `fallback_count` はヘッダの存在有無で判定
3. コスト未取得時は 0 とし、`agent_runs.estimated_cost_usd` を null のままにしない
4. `free_quota_exhausted` / `insufficient_quota` / HTTP 402 を
   `agent_run_status = 'rate_limited'` として扱い、モデル障害と区別する
5. `max_tokens` は reasoning トークン込みで見積もる（評価系は 1500 以上）
6. 埋め込みは `openai/text-embedding-3-small` / 1536次元で確定

---

# 追補: dev階層モデルの選定（2026-09-19 実測）

同一タスク（「y=2x+3 の傾きを答えよ」に生徒が「3」と誤答 → 採点させる）で比較した。
`response_format: json_schema, strict: true` を付け、`max_tokens: 1500`。

| モデル | 形式 | 内容 | 出力tok | うち推論 | 実測cost |
|---|---|---|---|---|---|
| **google/gemini-2.5-flash-lite** | ✅ | ✅ | **108** | **0** | **$0.000054** |
| openai/gpt-oss-120b | ✅ | ✅ | 381 | 248 | $0.000068 |
| qwen/qwen3.7-flash | ✅ | ❌ 誤答を正解と判定 | 986 | 929 | $0.00013 |
| z-ai/glm-5.3-flash | ❌ json_schemaを無視しMarkdownを返す | ✅ | 800 | 575 | $0.000206 |
| openai/gpt-5-nano | ✅ | ✅ | 1155 | 1024 | $0.00047 |

## 得られた知見

1. **額面単価と実測コストは一致しない。推論トークン量が支配的。**
   qwen3.7-flash は額面 $0.030/$0.130 で最安だが、出力986トークン中929が推論で、
   実測は gemini-2.5-flash-lite（額面 $0.100/$0.400）の 2.4倍高かった。
   → モデル選定は必ず実測で行う。額面比較は意思決定に使えない。

2. **安いモデルは構造化出力か内容のどちらかを落とす。**
   qwen は形式を守るが採点を間違え、glm は採点は正しいが json_schema を無視した。
   → `response_format` を出しても従わないモデルが実在する。
     Zod検証＋修復1回＋ルールベース縮退の梯子は必須。

3. **`usage.cost_usd` は有料モデルで実際に返る**（`X-OrcaRouter-Include-Cost: true`）。
   無料モデルでは返らない。

## 決定

```
dev 階層の連鎖（3社に分散 = 本物のフェイルオーバーになる）
  1. google/gemini-2.5-flash-lite   $0.100 / $0.400   Google
  2. openai/gpt-oss-120b            $0.030 / $0.170   OpenAI
  3. z-ai/glm-5.3-flash             $0.075 / $0.250   Z-AI
埋め込み
     openai/text-embedding-3-small  $0.020            1536次元
```

開発全体の再試算: 約9,000呼び出し × 約$0.00015 = **約 $1.4**（プロモ$20の7%）。
日次上限 $1.00 を `AI_DAILY_BUDGET_USD` で設定済み。

## カタログの「無料」表記について

`?sort=price-asc` で無料に見える9件の内訳:

- `deepseek-v4-flash-free` / `glm-5.3-flash-free` / `hy3-free` / `orcaverify-text1.0-free`
  → 402 `free_quota_exhausted` で**使えない**（課金実績$0の口座には割当が無い）
- `orcarouter/free` → 上記と同じ枠を使うルータ
- `orcarouter/auto` / `fusion` / `fusion-flash` / `fusion-mini`
  → **無料ではなくルータ**。価格欄が空なのは解決先モデルの価格で課金されるため

→ カタログの「無料」は現状の口座では選択肢にならない。
