import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_OPENING, TUTORIAL_FINISH, TUTORIAL_STOP_MESSAGE } from '@/lib/tutorial/content';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),get:vi.fn(),list:vi.fn(),append:vi.fn(),complete:vi.fn(),answer:vi.fn(),summary:vi.fn(),tutorial:vi.fn(),learning:vi.fn(),integrity:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('@/lib/auth/guard',()=>({requireRole:mocks.auth,requireAuth:mocks.auth}));
vi.mock('@/lib/database/admin',()=>({adminDb:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/database/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/jobs/queue',()=>({enqueueJob:vi.fn(),triggerWorkerTick:vi.fn()}));
vi.mock('@/lib/conversation/service',async original=>({...(await original<object>()),getConversation:mocks.get,listMessages:mocks.list,appendMessage:mocks.append,completeConversation:mocks.complete,recordConversationAnswer:mocks.answer,maybeQueueConversationSummary:mocks.summary}));
vi.mock('@/lib/tutorial/agent',()=>({tutorialAgent:{run:mocks.tutorial}}));
vi.mock('@/lib/agents/catalog',()=>({learningSupportAgent:{run:mocks.learning}}));
vi.mock('@/lib/integrity/record',()=>({recordAnswerIntegrity:mocks.integrity}));
import { POST as start } from '@/app/api/student-tutorial/route';
import { POST as reply } from '@/app/api/conversations/[id]/messages/route';
const id='1f0b4c4c-a20e-4783-92bf-cea9f0c732d8';
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({tenantId:'tenant',userId:'student',role:'student'});
  mocks.rpc.mockResolvedValue({data:id,error:null});
  mocks.get.mockResolvedValue({id,purpose:'tutorial',state:'awaiting_student',student_id:'student',message_count:1});
  mocks.list.mockResolvedValue([{actor:'agent',content_redacted:TUTORIAL_OPENING,seq:1},{actor:'student',content_redacted:'サッカーが好き',seq:2}]);
  mocks.append.mockResolvedValue({content_redacted:'サッカーが好き'});
  mocks.tutorial.mockResolvedValue({data:{message:'パスをつなぐのが好きなんだね！どんなときが楽しい？',shouldFinish:false},meta:{runId:'run'}});
});
describe('初回の練習API',()=>{
  it('先生が生徒の練習へ代わりに回答することを拒否する',async()=>{
    mocks.auth.mockResolvedValue({tenantId:'tenant',userId:'teacher',role:'teacher'});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'回答',stream:false})}),{params:Promise.resolve({id})});
    expect(response.status).toBe(403);expect(mocks.append).not.toHaveBeenCalled();expect(mocks.tutorial).not.toHaveBeenCalled();
  });
  it('最初の案内を固定文で保存し、開始だけではAIを呼ばない',async()=>{
    expect((await start()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('start_student_tutorial',{p_tenant:'tenant',p_student:'student',p_opening:TUTORIAL_OPENING});
    expect(mocks.tutorial).not.toHaveBeenCalled();expect(mocks.learning).not.toHaveBeenCalled();
  });
  it('最初の送信から専用AIに会話を渡し、回答・採点や計画更新を行わない',async()=>{
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'サッカーが好き',stream:false,assignmentId:id,questionId:id})}),{params:Promise.resolve({id})});
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain('パス');
    expect(mocks.tutorial).toHaveBeenCalledWith(expect.objectContaining({context:expect.stringContaining('サッカー')}),expect.objectContaining({modelClass:'standard'}));
    for(const fn of [mocks.answer,mocks.integrity,mocks.learning,mocks.summary,mocks.complete])expect(fn).not.toHaveBeenCalled();
  });
  it.each([3, 8, 21])('%i回話しても、内容がまだ途中なら打ち切らない',async(turns)=>{
    mocks.list.mockResolvedValue(Array.from({length:turns},(_,i)=>({actor:'student',content_redacted:'数学の文章題で困っています',seq:i+1})));
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'式を立てるところからわからない',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:false});
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('AIが内容と生徒の意向から終了を判断したら完了する',async()=>{
    mocks.tutorial.mockResolvedValue({data:{message:'話してくれてありがとう！宿題でも自分の言葉で教えてみよう。',shouldFinish:true},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'うん、ほかにはないよ',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:true});
    expect(mocks.complete).toHaveBeenCalledOnce();expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('生徒が自分で区切る場合は、AIを呼ばずに終了する',async()=>{
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:TUTORIAL_STOP_MESSAGE,stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({message:TUTORIAL_FINISH,conversationCompleted:true});
    expect(mocks.complete).toHaveBeenCalledOnce();expect(mocks.tutorial).not.toHaveBeenCalled();
  });
});
