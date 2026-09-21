import { config } from 'dotenv';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
config({path:'.env.local',quiet:true});
const run=process.env.DATABASE_URL ? describe : describe.skip;
run('授業記録→個別課題→確認配信（AI課金なし・全件ロールバック）',()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  let tenant:string, teacher:string, outsider:string, student:string, otherStudent:string, classroom:string, otherClass:string, prep:string;
  const due=new Date(Date.now()+86400000).toISOString();
  const title='一次関数の授業';
  const content='傾きと切片を学習。文章題は未習。';
  async function reject(sql:string,params:unknown[],message:string) {
    await db.query('savepoint expected_error');
    try { await expect(db.query(sql,params)).rejects.toThrow(message); }
    finally { await db.query('rollback to savepoint expected_error'); }
  }
  beforeAll(async()=>{
    await db.connect();await db.query('begin');
    tenant=(await db.query("insert into tenants(name,ai_budget_limit_usd) values('課題準備テスト',0) returning id")).rows[0].id;
    const ids=[];
    for(const role of ['teacher','teacher','student','student']) {
      const id=crypto.randomUUID();ids.push(id);
      await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",[id,`${id}@example.invalid`]);
      await db.query('insert into users(id,tenant_id,role,display_name) values($1,$2,$3,$4)',[id,tenant,role,role]);
    }
    [teacher,outsider,student,otherStudent]=ids;
    classroom=(await db.query("insert into classrooms(tenant_id,name,subject) values($1,'数学','数学') returning id",[tenant])).rows[0].id;
    otherClass=(await db.query("insert into classrooms(tenant_id,name,subject) values($1,'英語','英語') returning id",[tenant])).rows[0].id;
    for(const [id,role,cls] of [[teacher,'teacher',classroom],[outsider,'teacher',otherClass],[student,'student',classroom],[otherStudent,'student',classroom],[student,'student',otherClass]]) await db.query('insert into enrollments(tenant_id,classroom_id,user_id,role) values($1,$2,$3,$4)',[tenant,cls,id,role]);
  });
  afterAll(async()=>{await db.query('rollback');await db.end();});
  it('授業記録一つからクラス全員分を予約し、再送で課金対象を増やさない',async()=>{
    prep=crypto.randomUUID();
    for(let i=0;i<2;i++) await db.query('select queue_lesson_preparation($1,$2,$3,$4,$5,$6,$7)',[tenant,teacher,prep,classroom,title,content,due]);
    const jobs=(await db.query("select * from jobs where tenant_id=$1 and payload->>'preparationId'=$2",[tenant,prep])).rows;
    expect(jobs).toHaveLength(2);
    expect(jobs.every(job=>job.kind==='prepare_lesson_student')).toBe(true);
    expect(new Set(jobs.map(job=>job.payload.studentId))).toEqual(new Set([student,otherStudent]));
    await reject('select queue_lesson_preparation($1,$2,$3,$4,$5,$6,$7)',[tenant,teacher,prep,classroom,title,'changed',due],'受付内容');
  });
  it('担当外のクラスや生徒ロールからは予約できない',async()=>{
    for(const actor of [outsider,student]) await reject('select queue_lesson_preparation($1,$2,$3,$4,$5,$6,$7)',[tenant,actor,crypto.randomUUID(),classroom,title,content,due],'担当クラス');
  });
  it('一人の保存・再試行が他の生徒や配信状態に影響しない',async()=>{
    const job=(await db.query("select * from jobs where tenant_id=$1 and payload->>'studentId'=$2",[tenant,student])).rows[0];
    await db.query("insert into learning_plans(id,tenant_id,student_id,classroom_id,preparation_id,period_start,period_end,tasks,rationale) values($1,$2,$3,$4,$5,current_date,current_date+6,'[]','模試と授業の範囲を参考')",[job.id,tenant,student,classroom,prep]);
    const call=()=>db.query('select create_explanation_work($1,$2,$3,$4,$5,$6,2,$7,$8,false,$9) as id',[tenant,teacher,classroom,title,'傾きの意味を説明して',content,student,job.id,due]);
    const first=(await call()).rows[0].id;expect((await call()).rows[0].id).toBe(first);
    expect((await db.query('select status from assignments where id=$1',[first])).rows[0].status).toBe('draft');
    await db.query("update jobs set lease_token=gen_random_uuid(),status='leased' where id=$1",[job.id]);
    await db.query('select fail_leased_job(id,lease_token,$2) from jobs where id=$1',[job.id,'テスト用障害']);
    expect((await db.query('select retry_lesson_preparation($1,$2,$3) as n',[tenant,teacher,prep])).rows[0].n).toBe(1);
    expect((await db.query('select attempt,status from jobs where id=$1',[job.id])).rows[0]).toMatchObject({attempt:0,status:'queued'});
    expect((await call()).rows[0].id).toBe(first);
    expect((await db.query('select retry_lesson_preparation($1,$2,$3) as n',[tenant,teacher,prep])).rows[0].n).toBe(0);
  });
  it('確認後に更新された課題を含む一括配信は全件ロールバックする',async()=>{
    const one=(await db.query('select id from assignments where tenant_id=$1',[tenant])).rows[0].id;
    const two=(await db.query('select create_explanation_work($1,$2,$3,$4,$5,$6,2,$7,null,false,$8) as id',[tenant,teacher,classroom,title,'切片の意味を説明して',content,otherStudent,due])).rows[0].id;
    const items=[one,two].sort().map(id=>({id,revision:0,title,body:'自分の言葉で説明して',content,difficulty:2,dueAt:due}));
    await db.query('update assignments set due_at=$2 where id=$1',[items[1].id,due]);
    await reject('select review_explanation_works($1,$2,$3,true)',[tenant,teacher,JSON.stringify(items)],'更新されています');
    expect((await db.query('select distinct status from assignments where id=any($1::uuid[])',[[one,two]])).rows).toEqual([{status:'draft'}]);
    items[1].revision=1;
    await reject('select review_explanation_works($1,$2,$3,true)',[tenant,outsider,JSON.stringify(items)],'担当外');
    expect((await db.query('select review_explanation_works($1,$2,$3,true) as n',[tenant,teacher,JSON.stringify(items)])).rows[0].n).toBe(2);
    expect((await db.query('select distinct status from assignments where id=any($1::uuid[])',[[one,two]])).rows).toEqual([{status:'published'}]);
    expect((await db.query('select count(*)::int as n from assignments where id=any($1::uuid[]) and approved_by=$2',[[one,two],teacher])).rows[0].n).toBe(2);
  });
  it('生徒に授業記録と計画を見せず、先生も担当クラスだけを読める',async()=>{
    for(const [actor,role,expected] of [[student,'student',0],[outsider,'teacher',0],[teacher,'teacher',1]] as const) {
      await db.query('savepoint rls_check');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,tenant_id:tenant,app_role:role,role:'authenticated'})]);
      await db.query('set local role authenticated');
      expect((await db.query('select count(*)::int as n from lesson_preparations where tenant_id=$1',[tenant])).rows[0].n).toBe(expected);
      expect((await db.query('select count(*)::int as n from learning_plans where tenant_id=$1',[tenant])).rows[0].n).toBe(expected);
      await db.query('rollback to savepoint rls_check');
    }
    expect((await db.query("select has_function_privilege('authenticated','review_explanation_works(uuid,uuid,jsonb,boolean)','execute') as allowed")).rows[0].allowed).toBe(false);
  });
});
