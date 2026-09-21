import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_OPENING, TUTORIAL_FINISH, TUTORIAL_STOP_MESSAGE, TUTORIAL_MAX_STUDENT_TURNS, tutorialOpening } from '@/lib/tutorial/content';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),profile:vi.fn(),scope:vi.fn(),auth:vi.fn(),get:vi.fn(),list:vi.fn(),append:vi.fn(),complete:vi.fn(),answer:vi.fn(),summary:vi.fn(),tutorial:vi.fn(),learning:vi.fn(),integrity:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:vi.fn()}));
vi.mock('@/lib/auth/guard',()=>({requireRole:mocks.auth,requireAuth:mocks.auth}));
vi.mock('@/lib/database/admin',()=>({adminDb:()=>({rpc:mocks.rpc,from:()=>{
  const query={select:()=>query,eq:(...args:unknown[])=>{mocks.scope(...args);return query;},maybeSingle:mocks.profile};return query;
}})}));
vi.mock('@/lib/database/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/jobs/queue',()=>({enqueueJob:vi.fn(),triggerWorkerTick:vi.fn()}));
vi.mock('@/lib/conversation/service',async original=>({...(await original<object>()),getConversation:mocks.get,listMessages:mocks.list,appendMessage:mocks.append,completeConversation:mocks.complete,recordConversationAnswer:mocks.answer,maybeQueueConversationSummary:mocks.summary}));
vi.mock('@/lib/tutorial/agent',()=>({tutorialAgent:{run:mocks.tutorial}}));
vi.mock('@/lib/agents/catalog',()=>({learningSupportAgent:{run:mocks.learning}}));
vi.mock('@/lib/integrity/record',()=>({recordAnswerIntegrity:mocks.integrity}));
vi.mock('@/lib/security/student-care-agent',()=>({classifyStudentCare:vi.fn(async()=>({category:'normal',evidence:'',reason:'',source:'model'}))}));
import { POST as start } from '@/app/api/student-tutorial/route';
import { POST as reply } from '@/app/api/conversations/[id]/messages/route';
const id='1f0b4c4c-a20e-4783-92bf-cea9f0c732d8';
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({tenantId:'tenant',userId:'student',role:'student'});
  mocks.rpc.mockResolvedValue({data:id,error:null});
  mocks.profile.mockResolvedValue({data:{grade:null},error:null});
  mocks.get.mockResolvedValue({id,purpose:'tutorial',state:'awaiting_student',student_id:'student',message_count:1});
  mocks.list.mockResolvedValue([{actor:'agent',content_redacted:TUTORIAL_OPENING,seq:1},{actor:'student',content_redacted:'サッカーが好き',seq:2}]);
  mocks.append.mockResolvedValue({content_redacted:'サッカーが好き'});
  mocks.tutorial.mockResolvedValue({data:{reflection:'パスをつなぐのが好きなんだね。',question:'どんなときが楽しい？',readyToFinish:false,stopRequested:false},meta:{runId:'run'}});
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
  it.each([['小学2年生','elementary'],['中学2年生','junior'],['高校2年生','senior']] as const)('%sには学年別の固定文を保存する',async(grade,audience)=>{
    mocks.profile.mockResolvedValue({data:{grade},error:null});
    expect((await start()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('start_student_tutorial',{p_tenant:'tenant',p_student:'student',p_opening:tutorialOpening(audience)});
    expect(mocks.scope).toHaveBeenCalledWith('tenant_id','tenant');expect(mocks.scope).toHaveBeenCalledWith('user_id','student');
    expect(mocks.tutorial).not.toHaveBeenCalled();
  });
  it('送信後のAIにも登録学年に合った文体を渡す',async()=>{
    mocks.profile.mockResolvedValue({data:{grade:'高校2年生'},error:null});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'サッカーが好き',stream:false})}),{params:Promise.resolve({id})});
    expect(response.status).toBe(200);
    expect(mocks.tutorial).toHaveBeenCalledWith(expect.objectContaining({audience:'senior'}),expect.anything());
  });
  it('最初の送信から専用AIに会話を渡し、回答・採点や計画更新を行わない',async()=>{
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'サッカーが好き',stream:false,assignmentId:id,questionId:id})}),{params:Promise.resolve({id})});
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain('パス');
    expect(mocks.tutorial).toHaveBeenCalledWith(expect.objectContaining({context:expect.stringContaining('サッカー')}),expect.objectContaining({modelClass:'economy'}));
    for(const fn of [mocks.answer,mocks.integrity,mocks.learning,mocks.summary,mocks.complete])expect(fn).not.toHaveBeenCalled();
  });
  it('3往復目でAIが終了を選んでも、受け止めと次の問いを返す',async()=>{
    mocks.list.mockResolvedValue(Array.from({length:3},(_,i)=>({actor:'student',content_redacted:'古文の単語がわからない',seq:i+1})));
    mocks.tutorial.mockResolvedValue({data:{reflection:'言葉の意味で読むのが難しくなるんだね。',question:'最近の授業では、どんな場面で困った？',readyToFinish:true,stopRequested:false},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'古文の単語がわからない',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:false,message:expect.stringContaining('どんな場面で困った？')});
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('本人が疲れたと伝えたときは、4往復未満でも終了できる',async()=>{
    mocks.tutorial.mockResolvedValue({data:{reflection:'今日は休みたいんだね。',question:'',readyToFinish:false,stopRequested:true},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'疲れたので終わりたいです',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:true});
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it('AIが受け止め欄に質問を書いても、要約の要求を追加して保存しない',async()=>{
    const reflection='音楽がお好きなんですね。どんな音楽を聴くことが多いですか？';
    mocks.tutorial.mockResolvedValue({data:{reflection,question:'',readyToFinish:false,stopRequested:false},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'最近は音楽が好きです',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({message:reflection,conversationCompleted:false});
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([3, 4])('%i回では内容に応じてもう一度答えられる',async(turns)=>{
    mocks.list.mockResolvedValue(Array.from({length:turns},(_,i)=>({actor:'student',content_redacted:'数学の文章題で困っています',seq:i+1})));
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'式を立てるところからわからない',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:false});
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each([TUTORIAL_MAX_STUDENT_TURNS, 13, 21])('%i回の会話では、AIが追加質問しても締めて終了する',async(turns)=>{
    mocks.list.mockResolvedValue(Array.from({length:turns},(_,i)=>({actor:'student',content_redacted:'古文の単語の意味がわからない',seq:i+1})));
    mocks.tutorial.mockResolvedValue({data:{reflection:'困っていることを教えてくれたんだね。',question:'今後の目標も教えてください。',readyToFinish:false,stopRequested:false},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'ほぼ全部わからない',stream:false})}),{params:Promise.resolve({id})});
    const body=await response.json();
    expect(body.conversationCompleted).toBe(true);expect(body.message).not.toContain('目標も');
    expect(mocks.tutorial).toHaveBeenCalledWith(expect.objectContaining({studentTurn:turns}),expect.anything());
    expect(mocks.complete).toHaveBeenCalledOnce();expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('上限でAIがまとめられた場合は、本人の話を受け止めた文を残す',async()=>{
    mocks.list.mockResolvedValue(Array.from({length:TUTORIAL_MAX_STUDENT_TURNS},(_,i)=>({actor:'student',content_redacted:'古文の単語の意味がわからない',seq:i+1})));
    const closing='古文は単語の意味で困っているんだね。';
    mocks.tutorial.mockResolvedValue({data:{reflection:closing,question:'',readyToFinish:true,stopRequested:false},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'そうです',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({message:expect.stringContaining(closing),conversationCompleted:true});
  });
  it('4往復目からは、終了確認を挟まず完了できる',async()=>{
    mocks.list.mockResolvedValue(Array.from({length:4},(_,i)=>({actor:'student',content_redacted:'古文の単語の意味がわからない',seq:i+1})));
    mocks.tutorial.mockResolvedValue({data:{reflection:'古文は言葉の意味で困っているんだね。',question:'',readyToFinish:true,stopRequested:false},meta:{runId:'run'}});
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:'古文の単語の意味がわからない',stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({conversationCompleted:true});
    expect(mocks.complete).toHaveBeenCalledOnce();expect(mocks.answer).not.toHaveBeenCalled();
  });
  it('生徒が自分で区切る場合は、AIを呼ばずに終了する',async()=>{
    const response=await reply(new Request('http://local/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:TUTORIAL_STOP_MESSAGE,stream:false})}),{params:Promise.resolve({id})});
    expect(await response.json()).toMatchObject({message:TUTORIAL_FINISH,conversationCompleted:true});
    expect(mocks.complete).toHaveBeenCalledOnce();expect(mocks.tutorial).not.toHaveBeenCalled();
  });
});
