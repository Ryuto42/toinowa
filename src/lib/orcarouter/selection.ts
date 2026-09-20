export type ModelClass = 'economy' | 'standard' | 'advanced' | 'vision';

export function classForDifficulty(difficulty: number): Exclude<ModelClass, 'vision'> {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error('難易度は1〜5です');
  return difficulty <= 2 ? 'economy' : difficulty === 3 ? 'standard' : 'advanced';
}

export function modelsForClass(kind: ModelClass, config: {
  AI_ECONOMY_MODEL?: string; AI_STANDARD_MODEL?: string; AI_ADVANCED_MODEL?: string; AI_VISION_MODEL?: string;
}): string[] {
  const economy = config.AI_ECONOMY_MODEL ?? 'google/gemini-2.5-flash-lite';
  const standard = config.AI_STANDARD_MODEL ?? 'google/gemini-2.5-flash';
  const advanced = config.AI_ADVANCED_MODEL ?? 'orcarouter/auto';
  const vision = config.AI_VISION_MODEL ?? 'google/gemini-2.5-flash';
  const chains = { economy: [economy, 'openai/gpt-4o-mini'], standard: [standard, 'openai/gpt-4o-mini'], advanced: [advanced, 'google/gemini-2.5-flash', 'openai/gpt-5-nano'], vision: [vision, 'openai/gpt-4o-mini'] };
  return [...new Set(chains[kind])];
}
