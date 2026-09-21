# トイノワ

ファインマンテクニックに着想を得た、授業後の復習を支えるAIエージェントです。先生が授業記録を渡すと、生徒別の課題と学習計画を準備します。先生の確認・配信後、生徒がAIに概念を説明し、対話の分析から次の学習計画を更新します。

## 起動

Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / Supabase / OrcaRouterを使用しています。

```bash
npm ci
# .env.exampleを参考に.env.localを設定
npm run db:push
npm run db:types
npm run dev
```

http://localhost:3000 を開きます。接続先DBの既存マイグレーション履歴に不一致がある場合は、履歴を上書きせず下記ガイドを参照してください。

## ドキュメント

- [先生・生徒・管理者の使い方ガイド](docs/user-guide.md)
- [操作・モデル設定・検証方法](docs/feature-guide.md)
- [改善と検証の記録](docs/improvements.md)
- [文書の一覧](docs/README.md)

```bash
npm test
npm run lint
npm run build
```

`npm run test:db`で権限とDB処理、起動後の`npm run test:smoke`で実際のAIを含む一連の処理を検証できます。後者はAPI費用が発生します。
