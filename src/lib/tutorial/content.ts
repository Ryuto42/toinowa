export const TUTORIAL_TITLE = 'はじめまして！AIと話してみよう';
export const TUTORIAL_AUDIENCES = ['elementary', 'junior', 'senior', 'general'] as const;
export type TutorialAudience = typeof TUTORIAL_AUDIENCES[number];

export function tutorialAudienceForGrade(grade?: string | null): TutorialAudience {
  const normalized = grade?.normalize('NFKC').replace(/\s/gu, '') ?? '';
  if (/^(小学校|小学|小[1-6一二三四五六])/u.test(normalized)) return 'elementary';
  if (/^(中学校|中学|中[1-3一二三])/u.test(normalized)) return 'junior';
  if (/^(高等学校|高校|高[1-3一二三])/u.test(normalized)) return 'senior';
  return 'general';
}

const OPENINGS: Record<TutorialAudience, string> = {
  elementary: `こんにちは！あなたの話をきくAIだよ。すきなことを、ひとつ教えてね。

「サッカーがすき」くらいの短い文でだいじょうぶ。下に書いて「送信（そうしん）」をおしてみよう。`,
  junior: `こんにちは！まずは、好きなことや最近夢中になっていることを一つ教えてくれる？

短い文で大丈夫。下に書いて「送信」を押してみよう。`,
  senior: `こんにちは。まずは、好きなことや最近関心のあることを一つ教えてください。

短い文章で大丈夫です。下の入力欄に書いて「送信」を押してみてください。`,
  general: `こんにちは！まずは、好きなことを一つ教えてください。

短い文で大丈夫です。下の入力欄に書いて「送信」を押してみましょう。`,
};
export function tutorialOpening(audience: TutorialAudience): string {
  return OPENINGS[audience];
}
// 学年が未設定・判別できない場合にも、年齢を決めつけない固定文を使う。
export const TUTORIAL_OPENING = OPENINGS.general;
// 通常4〜6往復、5往復を目安とする。本人の終了希望は最小回数より優先。
export const TUTORIAL_MIN_STUDENT_TURNS = 4;
export const TUTORIAL_TARGET_STUDENT_TURNS = 5;
export const TUTORIAL_MAX_STUDENT_TURNS = 6;
export const TUTORIAL_STOP_MESSAGE = '今回はここまで';
export const TUTORIAL_FINISH = '話してくれてありがとう！今日はここまでにしよう。先生から宿題が届いたら、同じように自分の言葉でAIに教えてみよう！';

export const TUTORIAL_TONES: Record<TutorialAudience, string> = {
  elementary: '小学生向け。短い文で、やさしい言葉やひらがなを使う。難しい漢字や抽象語は避け、赤ちゃん言葉にはしない。',
  junior: '中学生向け。親しみやすく、率直でわかりやすい言葉を使う。幼児向けの言い回しや大げさな褒め方は避ける。',
  senior: '高校生向け。相手を尊重した自然で落ち着いた言葉遣いにする。幼い呼びかけや過剰な感嘆符は避ける。',
  general: '学年は判別できない。年齢を決めつけず、平易で中立的な言葉遣いにする。',
};
