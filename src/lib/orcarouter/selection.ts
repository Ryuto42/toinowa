export type ModelClass = 'economy' | 'standard' | 'advanced' | 'vision' | 'audio';

export function classForDifficulty(difficulty: number): Exclude<ModelClass, 'vision' | 'audio'> {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error('難易度は1〜5です');
  return difficulty <= 2 ? 'economy' : difficulty === 3 ? 'standard' : 'advanced';
}

export function modelsForClass(kind: ModelClass, config: {
  AI_ECONOMY_MODEL?: string; AI_STANDARD_MODEL?: string; AI_ADVANCED_MODEL?: string; AI_VISION_MODEL?: string;
  AI_AUDIO_MODEL?: string; AI_AUDIO_STANDARD_MODEL?: string; AI_AUDIO_ADVANCED_MODEL?: string;
}): string[] {
  const economy = config.AI_ECONOMY_MODEL ?? 'google/gemini-2.5-flash-lite';
  const standard = config.AI_STANDARD_MODEL ?? 'google/gemini-2.5-flash';
  const advanced = config.AI_ADVANCED_MODEL ?? 'orcarouter/studypilot-advanced';
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
    vision: [vision, 'openai/gpt-4o-mini'],
    audio: [audio, audioStandard, audioAdvanced],
  };
  return [...new Set(chains[kind])];
}
