export type SafetyRisk = 'none' | 'low' | 'medium' | 'high';

export interface InputInspection {
  risk: SafetyRisk;
  normalized: string;
  categories: string[];
  matched: string[];
}

const ZERO_WIDTH_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g;

const rules: Array<{ category: string; risk: Exclude<SafetyRisk, 'none'>; pattern: RegExp }> = [
  {
    category: 'instruction_override',
    risk: 'high',
    pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|earlier|以上の|前の)\s+(?:instructions?|指示)/i,
  },
  {
    category: 'instruction_override',
    risk: 'high',
    pattern: /(?:これまでの指示|前の指示|システム指示)を(?:すべて|全部)?(?:無視|忘れ)/i,
  },
  {
    category: 'role_injection',
    risk: 'high',
    pattern: /<\|im_(?:start|end)\|>|^\s*###\s*(?:system|developer|assistant)\s*:/im,
  },
  {
    category: 'role_injection',
    risk: 'high',
    pattern: /(?:あなたは今から|you are now)\s*(?:開発者|管理者|developer|system)/i,
  },
  {
    category: 'secret_extraction',
    risk: 'high',
    pattern: /(?:system\s+prompt|システムプロンプト|隠し指示|秘密|api\s*key|token)を?(?:表示|出力|教え|開示|漏ら)/i,
  },
  {
    category: 'tool_abuse',
    risk: 'high',
    pattern: /(?:ツール|tool|function)を(?:呼び出|実行)|(?:call|execute)\s+(?:a\s+)?tool/i,
  },
  {
    category: 'encoded_payload',
    risk: 'high',
    pattern: /(?:[A-Za-z0-9+/]{200,}={0,2}|[A-Fa-f0-9]{200,})/,
  },
  {
    category: 'external_url',
    risk: 'medium',
    pattern: /(?:https?:\/\/|www\.)\S+/i,
  },
  {
    category: 'jailbreak',
    risk: 'high',
    pattern: /(?:jailbreak|脱獄|制限を解除|安全機能を無効)/i,
  },
];

function maxRisk(a: SafetyRisk, b: SafetyRisk): SafetyRisk {
  const order: SafetyRisk[] = ['none', 'low', 'medium', 'high'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

/** 制御文字を正規化してから検査する。ゼロ幅文字による回避を許さない。 */
export function inspectInput(input: string): InputInspection {
  const normalized = input.replace(ZERO_WIDTH_AND_BIDI, '');
  let risk: SafetyRisk = 'none';
  const categories: string[] = [];
  const matched: string[] = [];

  for (const rule of rules) {
    const match = normalized.match(rule.pattern);
    if (!match) continue;
    risk = maxRisk(risk, rule.risk);
    categories.push(rule.category);
    matched.push(match[0].slice(0, 120));
  }

  return {
    risk,
    normalized,
    categories: [...new Set(categories)],
    matched: [...new Set(matched)],
  };
}
