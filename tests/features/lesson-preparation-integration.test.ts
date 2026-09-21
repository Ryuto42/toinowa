import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobRow } from '@/lib/jobs/types';
config({path:'.env.local',quiet:true});
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('@/lib/agents/catalog',()=>({curriculumAgent:{run:mocks.run}}));
const run=process.env.DATABASE_URL && process.env.SUPABASE_SECRET_KEY ? describe : describe.skip;
run('個別計画workerの実DB接続（モデルのみ固定・費用0）',()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  let tenant:string, teacher:string, student:string, classroom:string, job:JobRow;
  const users:string[]=[];
  beforeAll(async()=>{
    await db.connect();
    tenant=(await db.query("insert into tenants(name,ai_budget_limit_usd) values('worker接続検証',0) returning id")).rows[0].id;
    for(const role of ['teacher','student']){
      const id=crypto.randomUUID(); users.push(id);
      await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",[id,`${id}@example.invalid`]);
      await db.query('insert into users(id,tenant_id,role,display_name) values($1,$2,$3,$4)',[id,tenant,role,role]);
      if(role==='teacher') teacher=id;else student=id;
    }
    classroom=(await db.query("insert into classrooms(tenant_id,name,subject,grade) values($1,'検証数学','数学','中2') returning id",[tenant])).rows[0].id;
    for(const [id,role] of [[teacher,'teacher'],[student,'student']]) await db.query('insert into enrollments(tenant_id,classroom_id,user_id,role) values($1,$2,$3,$4)',[tenant,classroom,id,role]);
    await db.query("insert into student_profiles(user_id,tenant_id,grade,exam_results) values($1,$2,'中2','一次関数40/100')",[student,tenant]);
    await db.query('begin');
    const prep=crypto.randomUUID();
    await db.query('select queue_lesson_preparation($1,$2,$3,$4,$5,$6,now()+interval \'1 day\')',[tenant,teacher,prep,classroom,'傾きと切片','一次関数のグラフを学習。文章題は未習。']);
    await db.query("update jobs set run_after=now()+interval '1 hour' where tenant_id=$1",[tenant]);
    await db.query('commit');
    job=(await db.query('select * from jobs where tenant_id=$1',[tenant])).rows[0];
    mocks.run.mockResolvedValue({data:{tasks:[{concept:'傾き',goal:'変化を説明する',prompt:'傾きが2とは何が変わること？',difficulty:2,minutes:10}],rationale:'授業の基本を説明して確かめる',evidence:['授業記録'],needsTeacherReview:true},meta:{runId:crypto.randomUUID()}});
  });
  afterAll(async()=>{
    // 他の利用者のデータには触れず、このテストの所属のみ片付ける。
    await db.query('rollback');
    if(tenant){
      for(const table of ['jobs','jobs_dead','assignments','learning_plans','lesson_preparations','lessons','classrooms','student_profiles']) await db.query(`delete from ${table} where tenant_id=$1`,[tenant]);
    }
    for(const id of users) await db.query('delete from auth.users where id=$1',[id]);
    if(tenant) await db.query('delete from tenants where id=$1',[tenant]);
    await db.end();
  });
  it('履歴の実取得から未公開課題の保存まで進み、再開時は保存結果を再利用する',async()=>{
    await import('@/lib/jobs/plan-handler');
    const {jobHandler}=await import('@/lib/jobs/registry');
    const handler=jobHandler('prepare_lesson_student')!;
    const first=await handler(job);
    expect(first.nextStep).toBeNull();
    const plan=(await db.query('select * from learning_plans where id=$1',[job.id])).rows[0];
    expect(plan).toMatchObject({classroom_id:classroom,student_id:student});
    expect(plan.review_notes).toEqual(expect.arrayContaining([expect.stringContaining('30分')]));
    const work=(await db.query('select * from assignments where source_plan_id=$1',[job.id])).rows[0];
    expect(work).toMatchObject({status:'draft',student_id:student,classroom_id:classroom});
    expect(await handler(job)).toEqual(first);
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.run.mock.calls[0][0]).toMatchObject({masterySummary:expect.stringContaining('40/100'),lessonContext:expect.stringContaining('科目: 数学')});
  });
});
