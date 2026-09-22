# トイノワ

ファインマンテクニックに着想を得た、授業後の復習を支えるAIエージェントです。先生が授業記録を渡すと、生徒別の課題と学習計画を準備します。先生の確認・配信後、生徒がAIに概念を説明し、対話の分析から次の学習計画を更新します。

先生が資料を渡す → AIが個別案を準備 → 先生が承認・配信 → 生徒が説明 → AIが分析・次回案を準備、という流れです。クラス単位の授業にも、生徒を直接指定する個別指導にも対応します。

[AI HACK 2026](https://aihackathon.jp/)（テーマ: 業務を自律化するAIエージェント）への提出作品です。AIの呼び出しには[OrcaRouter](https://www.orcarouter.ai/ja)を使用しています。

- **公開URL**：https://toinowa.vercel.app
- **[開発記事](docs/qiita-article.md)**：課題・設計思想・実測・セキュリティ・自律性の線引きをまとめた本編です。
- **[文書の一覧](docs/README.md)**：各検証記録・使い方ガイドへの入口です。

モデル選びでは、同じ入力で品質・費用・時間を比較するOrcaReplayを使用しました。模試の疑わしい結果は原資料と照合するまで自動反映せず、保存済みの処理結果を再利用して再生成を減らします。学習効果や業務時間の削減率は未測定です。

ソースはMITライセンスで公開しています。

## 起動

Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Supabase / OrcaRouterを使用しています。

```bash
npm ci
# .env.exampleを参考に.env.localを設定
npm run db:push
npm run db:types
npm run dev
```

http://localhost:3000 を開きます。接続先DBの既存マイグレーション履歴に不一致がある場合は、履歴を上書きせず[setup.md](docs/setup.md)を参照してください。

## ドキュメント

- [先生・生徒・管理者の使い方ガイド](docs/user-guide.md)
- [操作・モデル設定・検証方法](docs/feature-guide.md)
- [Supabase / Vercel / OrcaRouter の構成](docs/setup.md)
- 上記以外の検証記録は [文書の一覧](docs/README.md) から辿れます。

```bash
npm test
npm run lint
npm run build
```

`npm run test:db`で権限とDB処理、起動後の`npm run test:smoke`で実際のAIを含む一連の処理を検証できます。後者はAPI費用が発生します。
