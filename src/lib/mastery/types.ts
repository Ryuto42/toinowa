/**
 * 理解度計算の型。
 *
 * このモジュールは I/O を一切持たず、LLM も呼ばない。
 * 先生に説明でき、争いになったときに再現でき、監査できることが要件であり、
 * その3つをLLMは満たせない。
 * Assessment Agent の仕事は「解答過程が妥当か」「どの誤概念が出たか」という
 * **成分の信号**を出すことまでで、算術はコードの仕事。
 */

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type ComponentKey =
  | 'recent'      // 直近問題の正答と解答過程
  | 'history'     // 同一単元の過去結果
  | 'transfer'    // 類題への転移
  | 'delayed'     // 遅延再テスト
  | 'selfCalib';  // 自己評価の較正

/** 設計書12.2の重み配分。合計1.0。 */
export const BASE_WEIGHTS: Record<ComponentKey, number> = {
  recent: 0.35,
  history: 0.2,
  transfer: 0.15,
  delayed: 0.2,
  selfCalib: 0.1,
};

export interface RecentSignal {
  /** 正答度 0..1。部分正答を表現できるようにスカラーにする */
  score: number;
  /** 解答過程の妥当性 0..1。Assessment Agent が出す */
  reasoningQuality: number;
  /** 使ったヒントの段数 0..3 */
  hintsUsed: number;
}

export interface HistorySignal {
  /** 新しい順のスコア列 */
  scores: number[];
}

export interface TransferSignal {
  /** is_transfer な問題のスコア列 */
  scores: number[];
}

export interface DelayedSignal {
  score: number;
  /** 学習からの経過日数。長いほど定着の証拠として重い */
  daysSinceLearned: number;
}

export interface SelfCalibSignal {
  /** 生徒の自己申告 1..5 */
  selfRating: number;
  /** 実際のスコア 0..1 */
  actualScore: number;
}

export interface MasteryInput {
  conceptId: string;
  recent: RecentSignal | null;
  history: HistorySignal | null;
  transfer: TransferSignal | null;
  delayed: DelayedSignal | null;
  selfCalib: SelfCalibSignal | null;
  currentDifficulty: DifficultyLevel;
}

export interface ComponentResult {
  key: ComponentKey;
  /** 成分単体のスコア 0..1 */
  raw: number;
  /** 基本重み */
  weight: number;
  /** 再正規化後に実際に適用した重み */
  applied: number;
}

export interface MasteryResult {
  /** 0..1。recent が無い場合は null（古いデータだけで採点しない） */
  score: number | null;
  /** 0..1。点数とは別物で、HITLの引き金になる */
  confidence: number;
  components: ComponentResult[];
  /** 観測数。confidence の volume 成分の根拠 */
  observationCount: number;
  /** confidence < LOW_CONFIDENCE_THRESHOLD なら先生レビューへ回す */
  needsReview: boolean;
}

/** これを下回る確信度の評価は必ず先生レビューに回す（設計書11章・18.5） */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
