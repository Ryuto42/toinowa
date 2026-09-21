export type WellbeingCategory = 'self_harm' | 'child_safety';

export interface WellbeingSignal {
  category: WellbeingCategory;
  matched: string[];
}

const ZERO_WIDTH_AND_BIDI = /[​-‏‪-‮⁠⁦-⁩]/g;

/**
 * OrcaRouter のガードレール（flag 動作）と同じ語を持つ。
 * ゲートウェイは記録するだけで応答を返さないため、要フォローへ上げるのはアプリ側の仕事になる。
 * 遮断はしない。つらい相談を「安全性エラー」で突き返すのは、この場面で最も避けたい挙動。
 */
const LISTS: Array<{ category: WellbeingCategory; words: string[] }> = [
  {
    category: 'self_harm',
    words: ['死にたい', '消えたい', '自殺', '自傷', 'リストカット', '首を吊', '死ぬ方法',
      '生きるのがつらい', '生きていたくない', 'いなくなりたい',
      'kill myself', 'suicide', 'self-harm', 'end my life', 'want to die'],
  },
  {
    category: 'child_safety',
    words: ['いじめられ', '仲間はずれ', '暴力をふるわれ', '殴られて', '虐待', '親に殴',
      '家に帰りたくない', '家に帰るのがこわい', '会おうと言われ', '住所を教えて',
      '自撮りを送っ', 'ふたりだけの秘密', '誰にも言わないでね'],
  },
];

/** 該当すれば最も重いカテゴリを1件だけ返す。自傷を子どもの安全より優先する。 */
export function detectWellbeing(input: string): WellbeingSignal | null {
  const text = input.replace(ZERO_WIDTH_AND_BIDI, '').normalize('NFKC').toLowerCase();
  for (const list of LISTS) {
    const matched = list.words.filter((word) => text.includes(word.toLowerCase()));
    if (matched.length) return { category: list.category, matched };
  }
  return null;
}

export const WELLBEING_TITLES: Record<WellbeingCategory, string> = {
  self_harm: '生徒が深刻な悩みを書き込みました',
  child_safety: '生徒の安全に関わる書き込みがありました',
};
