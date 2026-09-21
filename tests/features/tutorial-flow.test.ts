import { describe, expect, it } from 'vitest';
import { composeTutorialReply } from '@/lib/tutorial/flow';
const reply = { reflection: '言葉の意味で読むのが難しくなるんだね。', question: '自分の言葉で言い直すとどうなる？', readyToFinish: true, stopRequested: false };
describe('4〜6往復のチュートリアル', () => {
  it.each([1,2,3])('%i往復でAIが終了を選んでも、次の問いを残す', turn => {
    expect(composeTutorialReply(reply,turn,'senior')).toEqual({message:`${reply.reflection}\n${reply.question}`,conversationCompleted:false});
  });
  it.each([4,5])('%i往復なら会話に応じて終了でき、終了後の問いは出さない', turn => {
    const result=composeTutorialReply(reply,turn,'senior');
    expect(result.conversationCompleted).toBe(true);expect(result.message).toContain(reply.reflection);expect(result.message).not.toContain(reply.question);
    expect(composeTutorialReply({...reply,readyToFinish:false},turn,'senior').conversationCompleted).toBe(false);
  });
  it.each([6,13])('%i往復ではAIが質問を続けても締める', turn => {
    const result=composeTutorialReply({...reply,readyToFinish:false},turn,'senior');
    expect(result.conversationCompleted).toBe(true);expect(result.message).not.toContain('?');expect(result.message).not.toContain('？');
  });
  it('終了希望は最小回数に優先する',()=>{
    expect(composeTutorialReply({...reply,readyToFinish:false,stopRequested:true},1,'elementary').conversationCompleted).toBe(true);
  });
  it('早すぎる終了判断で問いが空でも、終了せず言い換えの練習へつなぐ',()=>{
    const result=composeTutorialReply({...reply,question:''},3,'senior');
    expect(result.conversationCompleted).toBe(false);expect(result.message).toContain('一言で言い直す');
  });
});
