export type ModelClass = 'economy' | 'standard' | 'advanced' | 'vision' | 'audio' | 'exam';

export function classForDifficulty(difficulty: number): Exclude<ModelClass, 'vision' | 'audio' | 'exam'> {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error('難易度は1〜5です');
  return difficulty <= 2 ? 'economy' : difficulty === 3 ? 'standard' : 'advanced';
}

export function modelsForClass(kind: ModelClass, config: {
  AI_ECONOMY_MODEL?: string; AI_STANDARD_MODEL?: string; AI_ADVANCED_MODEL?: string; AI_VISION_MODEL?: string;
  AI_AUDIO_MODEL?: string; AI_AUDIO_STANDARD_MODEL?: string; AI_AUDIO_ADVANCED_MODEL?: string; AI_EXAM_MODEL?: string;
}): string[] {
  const economy = config.AI_ECONOMY_MODEL ?? 'google/gemini-2.5-flash-lite';
  const standard = config.AI_STANDARD_MODEL ?? 'google/gemini-2.5-flash';
  const advanced = config.AI_ADVANCED_MODEL ?? 'orcarouter/toinowa-advanced';
  const vision = config.AI_VISION_MODEL ?? 'google/gemini-2.5-flash';
  // 音声入力に対応するのは Google 系だけ（カタログ199件を実測して確認）。
  // 他社を混ぜると必ず 400 になるので、段は同社内で積む。
  // 全滅したときの縮退はテキスト入力への切り替えで、ここには置かない。
  // 書き起こしは flash-lite だと同音異義語を外し、短い音では相づちを幻覚する。
  // 実測で差がはっきり出たので、1段目は flash にする（1回 $0.0005 程度で収まる）。
  const audio = config.AI_AUDIO_MODEL ?? 'google/gemini-2.5-flash';
  const audioStandard = config.AI_AUDIO_STANDARD_MODEL ?? 'google/gemini-flash-latest';
  const audioAdvanced = config.AI_AUDIO_ADVANCED_MODEL ?? 'google/gemini-2.5-flash-lite';
  const chains = {
    economy: [economy, 'openai/gpt-4o-mini'],
    standard: [standard, 'openai/gpt-4o-mini'],
    advanced: [advanced, 'google/gemini-2.5-flash', 'openai/gpt-5-nano'],
    // 模試読み取りの実測（実物2回分・9入力×3モデル＝27回、必要項目450件で採点）。
    // 必要項目の正確な取得は flash 88.7% / flash-lite 72.2% / gpt-4o-mini 6.9%。
    // mini は設問別結果を科目全体へ要約して必要項目を358件落とすので、2段目に置かない。
    // docs/exam-model-benchmark.md
    vision: [vision, 'google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini'],
    // 模試の専用経路。ページ単位の再試行は永続ジョブ側の責務にする。
    // 検証していない低品質な代替へ黙って落ちない。
    exam: [config.AI_EXAM_MODEL ?? 'google/gemini-2.5-flash'],
    audio: [audio, audioStandard, audioAdvanced],
  };
  return [...new Set(chains[kind])];
}
