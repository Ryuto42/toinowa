# StudyPilot

塾の先生の宿題準備・理解度確認・次回指導を支援するアプリです。生徒がAIに概念を説明し、先生が会話の根拠を確認します。AIは学習計画と宿題候補を作り、先生が対象生徒と期限を確認して配信します。

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

- [操作・モデル設定・検証方法](docs/feature-guide.md)
- [ハッカソンの目的・テーマ・評価基準と合意事項](docs/hackathon.md)
- [評価基準への対応・残る課題・4分デモ案](docs/hackathon-review.md)

```bash
npm test
npm run lint
npm run build
```

`npm run test:db`で権限とDB処理、起動後の`npm run test:smoke`で実際のAIを含む一連の処理を検証できます。後者はAPI費用が発生します。
