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

「サッカーがすき。友だちとあそぶのが楽しい」くらいでだいじょうぶ。下に書いて「送信（そうしん）」をおしてみよう。そのあと、べんきょうのことも聞かせてね。

名前や学校名は書かなくていいよ。これはれんしゅうだから、せいかいや点数はないよ。`,
  junior: `こんにちは！自分の言葉で説明する練習を、一緒にしていこう。まずは、好きなことや最近夢中になっていることを一つ教えてくれる？

短い文で大丈夫。下に書いて「送信」を押してみよう。そのあと、勉強で困っていることや、できるようになりたいことも聞かせてね。

名前や学校名を書く必要はないよ。この練習に正解や点数はありません。`,
  senior: `こんにちは。ここでは、自分の言葉で説明しながら学習を振り返ります。まずは、好きなことや最近関心のあることを一つ教えてください。

短い文章で大丈夫です。入力して「送信」を押すと、内容に合わせて質問します。その後、勉強の悩みや今後の目標も、話せる範囲で聞かせてください。

名前や学校名は不要です。この練習に正解や点数はありません。`,
  general: `こんにちは！あなたの説明を聞くAIです。まずは、好きなことを一つ教えてください。

短い文で大丈夫。下に書いて「送信」を押してみましょう。そのあと、勉強で困っていることや、できるようになりたいことも聞かせてください。

名前や学校名を書く必要はありません。この練習に正解や点数はありません。`,
};
export function tutorialOpening(audience: TutorialAudience): string {
  return OPENINGS[audience];
}
// 学年が未設定・判別できない場合にも、年齢を決めつけない固定文を使う。
export const TUTORIAL_OPENING = OPENINGS.general;
export const TUTORIAL_STOP_MESSAGE = '今回はここまで';
export const TUTORIAL_FINISH = '話してくれてありがとう！今日はここまでにしよう。先生から宿題が届いたら、同じように自分の言葉でAIに教えてみよう！';

export const TUTORIAL_TONES: Record<TutorialAudience, string> = {
  elementary: '小学生向け。短い文で、やさしい言葉やひらがなを使う。難しい漢字や抽象語は避け、赤ちゃん言葉にはしない。',
  junior: '中学生向け。親しみやすく、率直でわかりやすい言葉を使う。幼児向けの言い回しや大げさな褒め方は避ける。',
  senior: '高校生向け。相手を尊重した自然で落ち着いた言葉遣いにする。幼い呼びかけや過剰な感嘆符は避ける。',
  general: '学年は判別できない。年齢を決めつけず、平易で中立的な言葉遣いにする。',
};
