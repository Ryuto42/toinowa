# ドキュメント

記事・展示・発表の準備は **[evidence.md](evidence.md)** から参照する。確認できる実装・測定条件・限界を一つの入口にまとめている。詳細記録は下の文書に置く。

| 文書 | 内容 |
|---|---|
| [evidence.md](evidence.md) | 5つの評価項目に対する共通の根拠、実測・実装・未検証の区別 |
| [presentation-brief.md](presentation-brief.md) | 提出条件、記事・展示・4分ピッチの構成と素材 |
| [user-guide.md](user-guide.md) | 先生・生徒・管理者の使い方 |
| [feature-guide.md](feature-guide.md) | 機能の仕様、モデル設定、検証コマンド |
| [setup.md](setup.md) | Supabase / Vercel / OrcaRouter の構成と環境変数 |
| [nextjs-16-notes.md](nextjs-16-notes.md) | Next.js 16 の破壊的変更と、この実装での扱い |
| [improvements.md](improvements.md) | 改善と検証の記録（実測の根拠） |
| [orcarouter-findings.md](orcarouter-findings.md) | 初期スパイクの観測。現行設定の根拠と当時の判断を区別 |
| [exam-model-benchmark.md](exam-model-benchmark.md) | 模試読み取りモデルの比較実験（設計と初回結果） |
| [exam-model-benchmark-improvement.md](exam-model-benchmark-improvement.md) | 読み取りと提案生成を分けた追加検証（構造化抽出v2） |
| [exam-reading-reliability.md](exam-reading-reliability.md) | 検証・復旧の実装と採用判断（模試読み取りの現在の結論） |
| [brand-assets.md](brand-assets.md) | ロゴ・アイコンの仕様と置き場所 |
| [data/](data/) | 公開可能な比較結果・集計・自動テストの検証記録（JSON） |

実測していないことは主張しない、というのが全体の方針です。
各文書には「確認できていないこと」を明示した節を置いています。

## 記録の使い分け

- 現行の説明・発表用の主張は `evidence.md`、操作・仕様は `user-guide.md` と `feature-guide.md`。
- 初回・v2・v3の模試比較は条件が違うため別記録として維持する。集計は [exam-benchmark-summary.json](data/exam-benchmark-summary.json) から再利用できる。
- 自動テストの件数は [verification-2026-09-22.json](data/verification-2026-09-22.json) にコードのハッシュとともに記録。実AIの品質指標ではない。
- 統合前の `hackathon-*.md` と `exam-model-benchmark-results.md` 等を並行更新しない。必要なテーマ・条件・発表案は上の共通資料へ統合した。旧本文はGit履歴 `9ae754b` に残っている。
- 生徒の原資料・会話ログ・秘密値は公開資料へ入れない。キーや個人データを含まない集計を使う。
