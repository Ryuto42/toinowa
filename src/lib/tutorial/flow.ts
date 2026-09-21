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
  const reflection = reply.reflection.trim();
  // モデルがquestionではなくreflectionに問いを入れた場合、補助の問いを重ねない。
  if (!reply.question.trim() && /[?？]/u.test(reflection)) {
    return { message: reflection, conversationCompleted: false };
  }
  // 問いが全くない場合だけ会話を補う。要約・言い直しは課さない。
  const fallback = studentTurn === 1
    ? (audience === 'elementary' ? '今の話を、もう少し教えてくれる？' : '今の話について、もう少し教えてもらえますか？')
    : studentTurn === 2
      ? (audience === 'elementary' ? 'べんきょうでは、すきなことや気になることはある？' : '勉強では、好きなことや気になっていることはありますか？')
      : (audience === 'elementary' ? 'これから、できるようになったらうれしいことはある？' : 'これから、できるようになったらうれしいことはありますか？');
  const question = reply.question.trim() || fallback;
  return { message: [reflection, question].filter(Boolean).join('\n'), conversationCompleted: false };
}
