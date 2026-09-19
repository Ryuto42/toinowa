export type PiiKind = 'email' | 'phone' | 'postal_code' | 'card' | 'line_id' | 'honorific_name';

export interface PiiMatch {
  kind: PiiKind;
  start: number;
  end: number;
}

export interface MaskedText {
  text: string;
  matches: PiiMatch[];
}

const patterns: Array<{ kind: PiiKind; pattern: RegExp; replacement: string }> = [
  { kind: 'email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[EMAIL]' },
  {
    kind: 'postal_code',
    pattern: /(?:〒\d{3}[-ー]?\d{4}|(?<!\d)\d{3}[-ー]\d{4}(?![-ー]\d))/g,
    replacement: '[POSTAL_CODE]',
  },
  { kind: 'card', pattern: /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, replacement: '[CARD]' },
  { kind: 'phone', pattern: /(?<!\d)(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/g, replacement: '[PHONE]' },
  { kind: 'line_id', pattern: /(?:LINE\s*(?:ID|ユーザー名)|ラインID)\s*[:：]?\s*[@a-zA-Z0-9._-]{3,}/gi, replacement: '[LINE_ID]' },
  { kind: 'honorific_name', pattern: /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}A-Za-z]{1,12}(?:さん|くん|君|ちゃん|先生)/gu, replacement: '[NAME]' },
];

export function maskPII(input: string): MaskedText {
  let text = input;
  const matches: PiiMatch[] = [];
  for (const { kind, pattern, replacement } of patterns) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, (value, offset: number) => {
      matches.push({ kind, start: offset, end: offset + value.length });
      return replacement;
    });
  }
  return { text, matches };
}
