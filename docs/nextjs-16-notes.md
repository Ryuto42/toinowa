# Next.js 16 差分メモ（実装時の必読事項）

インストール版: **next 16.3.5** / react 19.2.8。
同梱ドキュメント: `node_modules/next/dist/docs/`（コードを書く前に該当ページを読むこと）。

プラン（`~/.claude/plans/md-dazzling-bee.md`）は Next 15 前提で書かれている箇所があるため、
以下を上書きする。

## 1. `middleware.ts` → `proxy.ts`（破壊的変更）

- ファイル名は `src/proxy.ts`、名前付きエクスポートは `export function proxy(request) {}`
- **`edge` ランタイムは非対応。`proxy` は常に `nodejs` ランタイムで、設定変更できない**
  - → JWTクレームを読むだけの門番なので Node ランタイムで問題なし
- `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`

## 2. Request API は完全に非同期（同期アクセスは削除）

`cookies()` / `headers()` / `draftMode()` / `params` / `searchParams` はすべて `await` が必須。

型は `npx next typegen` が生成する以下を使う:
- `PageProps<'/teacher/students/[studentId]'>`
- `LayoutProps<'/student'>`
- `RouteContext<'/api/conversations/[id]/messages'>`

```tsx
export default async function Page(props: PageProps<'/teacher/students/[studentId]'>) {
  const { studentId } = await props.params
}
```

## 3. キャッシュAPI（プランの「ダッシュボードのライブ反映」に直結）

| API | 用途 | 備考 |
|---|---|---|
| `revalidateTag(tag, profile)` | **第2引数の cacheLife プロファイルが必須になった**。1引数形式は型エラー | stale-while-revalidate。遅延を許容できるもの向け |
| `updateTag(tag)` | **Server Actions 専用**。同一リクエスト内で失効＋即再取得（read-your-writes） | **先生ダッシュボードの即時反映はこれを使う** |
| `refresh()` | Server Action からクライアントルータを更新 | 通知バッジ等 |
| `cacheLife` / `cacheTag` | `unstable_` 接頭辞が取れて安定版に | |

→ プラン §11 の「`revalidateTag` だけでは既に開いているブラウザが再描画されない」は依然として正しい。
   サーバ側は `updateTag`、他ブラウザへの反映は SSE + `router.refresh()` の二段構えにする。

## 4. PPR は `experimental.ppr` / `experimental_ppr` が削除され `cacheComponents: true` に

**当面は有効化しない。** `cacheComponents` はリネームではなく、
`<Suspense>` の外にある未キャッシュデータでビルドエラーになる別モデルへの移行が必要。
安定してから検討する。

## 5. その他

- **Turbopack が既定**（`--turbopack` 不要）。カスタム webpack 設定があるとビルドが失敗する
- `experimental.dynamicIO` / `experimental.useCache` は削除
- `unstable_rootParams` → `next/root-params`
- `next lint` は廃止 → ESLint CLI 直叩き（`package.json` は既に `"lint": "eslint"`）
- ESLint は Flat Config
- Node.js 20.9+ / TypeScript 5.1+ が必須
- `after()` は利用可能（`agent_runs` の fire-and-forget 書き込みに使う）
- 並列ルートの `default.js` が必須になった

## 6. スキャフォールド時の既定

`create-next-app` が `AGENTS.md` と `CLAUDE.md`(`@AGENTS.md`) を生成する。
`AGENTS.md` の `<!-- BEGIN:nextjs-agent-rules -->` ブロックは `next dev` が再生成するので、
消さずにコミットに含める。
