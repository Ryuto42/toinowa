import { TUTORIAL_MIN_STUDENT_TURNS, TUTORIAL_MAX_STUDENT_TURNS, type TutorialAudience } from './content';

export interface TutorialReply {
  reflection: string;
  question: string;
  readyToFinish: boolean;
  stopRequested: boolean;
}

/** AIの受け止めと問いを分け、早すぎる終了と質問の引き延ばしを防ぐ。 */
export function composeTutorialReply(reply: TutorialReply, studentTurn: number, audience: TutorialAudience) {
  const completed = reply.stopRequested || studentTurn >= TUTORIAL_MAX_STUDENT_TURNS
    || (studentTurn >= TUTORIAL_MIN_STUDENT_TURNS && reply.readyToFinish);
  if (completed) {
    const closing = audience === 'elementary'
      ? '話してくれてありがとう！れんしゅうはここまで。しゅくだいでも、自分のことばでAIに教えてみよう。'
      : '話してくれてありがとう。練習はここまでです。宿題でも、同じように自分の言葉でAIに説明してみてください。';
    // 終了時は追加の質問を表示しない。万一、受け止めに質問が混ざった場合も締める。
    const reflection = /[?？]/u.test(reply.reflection) ? '' : reply.reflection.trim();
    return { message: [reflection, closing].filter(Boolean).join('\n'), conversationCompleted: true };
  }
  const question = reply.question.trim() || (audience === 'elementary'
    ? 'ここまで話したことを、もう一度あなたのことばで、ひとこと教えてくれる？'
    : 'ここまでの話を、一番伝えたいことに絞って一言で言い直すと、どうなりますか？');
  return { message: `${reply.reflection.trim()}\n${question}`, conversationCompleted: false };
}
