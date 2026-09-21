import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRow } from '@/lib/jobs/types';
const mocks=vi.hoisted(()=>({run:vi.fn(),history:vi.fn(),rpc:vi.fn(),responses:new Map<string,unknown[]>(),inserts:[] as unknown[]}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/agents/catalog',()=>({curriculumAgent:{run:mocks.run}}));
vi.mock('@/lib/materials/student-context',()=>({topicStudentContext:mocks.history}));
vi.mock('@/lib/database/admin',()=>({adminDb:()=>({
  rpc:mocks.rpc,
  from:(table:string)=>{
    const data=mocks.responses.get(table)?.shift();
    const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,single:()=>query,maybeSingle:()=>query,upsert:(value:unknown)=>{mocks.inserts.push(value);return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
    return query;
  },
})}));
import '@/lib/jobs/plan-handler';
import { jobHandler } from '@/lib/jobs/registry';
const job:JobRow={id:'job',tenant_id:'tenant',kind:'prepare_lesson_student',payload:{studentId:'student',classroomId:'class',preparationId:'prep',requestedBy:'teacher'},idempotency_key:'prep:student',trace_id:'trace',status:'leased',priority:6,step:'start',state:{},attempt:0,max_attempts:3,run_after:'2026-09-21T00:00:00Z',locked_until:null,lease_token:'lease',last_error:null,created_at:'2026-09-21T00:00:00Z',updated_at:'2026-09-21T00:00:00Z'};
const plan={id:'job',tasks:[{concept:'傾き',goal:'意味を説明',prompt:'傾きとは何か教えて',difficulty:2,est_min:10}]};
beforeEach(()=>{
  mocks.responses.clear();mocks.inserts.length=0;mocks.run.mockReset();mocks.rpc.mockReset();mocks.history.mockReset();
  mocks.responses.set('enrollments',[[{classroom_id:'class'}],[{user_id:'teacher'}]]);
  mocks.responses.set('lesson_preparations',[{id:'prep',student_ids:['student'],title:'一次関数',content:'傾きと切片。文章題は未習。',due_at:'2026-09-22T10:00:00Z'}]);
  mocks.responses.set('users',[{status:'active'}]);
  mocks.responses.set('student_profiles',[{daily_time_limit_min:null,current_difficulty:2}]);
  mocks.responses.set('learning_plans',[null,{id:'prior',tasks:[],rationale:'前の計画'},null,plan]);
  mocks.history.mockResolvedValue({text:'模試・過去の説明と先生の修正',feedbackUsed:0});
  mocks.run.mockResolvedValue({data:{tasks:[{concept:'傾き',goal:'意味を説明',prompt:'傾きとは何か教えて',difficulty:2,minutes:10}],rationale:'授業の意味の説明を優先',evidence:['授業記録'],needsTeacherReview:true},meta:{runId:'run'}});
  mocks.rpc.mockResolvedValue({data:'work',error:null});
});
describe('授業記録からの個別計画生成',()=>{
  it('授業範囲・個別履歴・前の計画を渡し、注意点付きの未公開課題を保存する',async()=>{
    await jobHandler('prepare_lesson_student')!(job);
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({lessonContext:expect.stringContaining('文章題は未習'),masterySummary:'模試・過去の説明と先生の修正',previousPlan:expect.stringContaining('前の計画')}),expect.objectContaining({studentId:'student'}));
    expect(mocks.inserts[0]).toMatchObject({classroom_id:'class',preparation_id:'prep',supersedes_plan_id:'prior',review_notes:expect.arrayContaining([expect.stringContaining('30分')])});
    expect(mocks.rpc).toHaveBeenCalledWith('create_explanation_work',expect.objectContaining({p_publish:false,p_student:'student',p_content:'一次関数\n傾きと切片。文章題は未習。',p_due_at:'2026-09-22T10:00:00Z'}));
  });
  it('別クラスの難易度ではなく、このクラスの直近評価から段階を調整する',async()=>{
    mocks.history.mockResolvedValue({text:'直近評価',feedbackUsed:1,latestDifficulty:4});
    await jobHandler('prepare_lesson_student')!(job);
    expect(mocks.inserts[0]).toMatchObject({tasks:expect.arrayContaining([expect.objectContaining({difficulty:3})])});
  });
  it('計画保存後の再実行ではAIへ再課金せず課題保存から再開する',async()=>{
    mocks.responses.set('learning_plans',[plan]);
    await jobHandler('prepare_lesson_student')!(job);
    expect(mocks.run).not.toHaveBeenCalled();expect(mocks.inserts).toHaveLength(0);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it('モデルが代替の空出力を返した場合は課題を作らない',async()=>{
    mocks.run.mockResolvedValue({data:{tasks:[]},meta:{degraded:true}});
    await expect(jobHandler('prepare_lesson_student')!(job)).rejects.toThrow('生成できません');
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.inserts).toHaveLength(0);
  });
  it('準備対象に含まれない生徒では履歴取得やモデル呼び出しをしない',async()=>{
    mocks.responses.set('lesson_preparations',[{id:'prep',student_ids:[]}]);
    await expect(jobHandler('prepare_lesson_student')!(job)).rejects.toThrow('準備対象');
    expect(mocks.run).not.toHaveBeenCalled();expect(mocks.history).not.toHaveBeenCalled();
  });
});
