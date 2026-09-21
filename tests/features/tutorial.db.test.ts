import { config } from 'dotenv';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { TUTORIAL_OPENING } from '@/lib/tutorial/content';
config({path:'.env.local',quiet:true});
const run=process.env.DATABASE_URL ? describe : describe.skip;
run('初回チャット練習の保存と採点からの分離（全件ロールバック）',()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  let tenant:string,student:string,other:string,admin:string,conversation:string,work:{concept:string;question:string;assignment:string};
  async function reject(sql:string,args:unknown[],message:string) {
    await db.query('savepoint rejected');
    try { await expect(db.query(sql,args)).rejects.toThrow(message); }
    finally { await db.query('rollback to savepoint rejected'); }
  }
  beforeAll(async()=>{
    await db.connect();await db.query('begin');
    tenant=(await db.query("insert into tenants(name,ai_budget_limit_usd) values('初回練習検証',0) returning id")).rows[0].id;
    const ids:string[]=[];
    for(const role of ['student','student','admin']) {
      const id=crypto.randomUUID();ids.push(id);
      await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",[id,`${id}@example.invalid`]);
      await db.query('insert into users(id,tenant_id,role,display_name) values($1,$2,$3,$4)',[id,tenant,role,role]);
    }
    [student,other,admin]=ids;
  });
  afterAll(async()=>{await db.query('rollback');await db.end();});
  it('一人一つの練習を再利用し、固定の案内を重複保存しない',async()=>{
    const start=async()=> (await db.query('select start_student_tutorial($1,$2,$3) as id',[tenant,student,TUTORIAL_OPENING])).rows[0].id;
    conversation=await start();expect(await start()).toBe(conversation);
    expect((await db.query('select purpose,message_count,lesson_id,concept_id from conversations where id=$1',[conversation])).rows[0]).toEqual({purpose:'tutorial',message_count:1,lesson_id:null,concept_id:null});
    expect((await db.query('select actor,content_redacted from messages where conversation_id=$1',[conversation])).rows).toEqual([{actor:'agent',content_redacted:TUTORIAL_OPENING}]);
    expect((await db.query('select id from jobs where tenant_id=$1',[tenant])).rowCount).toBe(0);
    await db.query("update conversations set state='completed',completed_at=now() where id=$1",[conversation]);
    expect(await start()).toBe(conversation);
    expect((await db.query('select state from conversations where id=$1',[conversation])).rows[0].state).toBe('completed');
  });
  it('初期パスワード未変更・利用停止・別所属・先生としての開始を拒否する',async()=>{
    await reject('select start_student_tutorial($1,$2,$3)',[tenant,admin,TUTORIAL_OPENING],'生徒');
    await reject('select start_student_tutorial($1,$2,$3)',[crypto.randomUUID(),student,TUTORIAL_OPENING],'生徒');
    await db.query('update users set must_change_password=true where id=$1',[other]);
    await reject('select start_student_tutorial($1,$2,$3)',[tenant,other,TUTORIAL_OPENING],'生徒');
    await db.query("update users set must_change_password=false,status='suspended' where id=$1",[other]);
    await reject('select start_student_tutorial($1,$2,$3)',[tenant,other,TUTORIAL_OPENING],'生徒');
    await db.query("update users set status='active' where id=$1",[other]);
  });
  it('他の生徒の練習は読めず、本人がDBから開始RPCを直接実行することもできない',async()=>{
    await db.query('savepoint rls');
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:other,tenant_id:tenant,app_role:'student',role:'authenticated'})]);
    await db.query('set local role authenticated');
    expect((await db.query('select id from conversations where id=$1',[conversation])).rowCount).toBe(0);
    expect((await db.query('select id from messages where conversation_id=$1',[conversation])).rowCount).toBe(0);
    await db.query('rollback to savepoint rls');
    expect((await db.query("select has_function_privilege('authenticated','start_student_tutorial(uuid,uuid,text)','execute') as allowed")).rows[0].allowed).toBe(false);
  });
  it('練習の対話を回答・理解度評価へ転用する書き込みをDBでも拒否する',async()=>{
    const cls=(await db.query("insert into classrooms(tenant_id,name,subject) values($1,'数学','数学') returning id",[tenant])).rows[0].id;
    await db.query("insert into enrollments(tenant_id,classroom_id,user_id,role) values($1,$2,$3,'student')",[tenant,cls,student]);
    const assignment=(await db.query("select create_explanation_work($1,$2,$3,'傾き','説明して','一次関数',2,$4,null,true,now()+interval '1 day') as id",[tenant,admin,cls,student])).rows[0].id;
    const question=(await db.query('select q.id,q.concept_id from assignments a join questions q on q.id=a.question_ids[1] where a.id=$1',[assignment])).rows[0];
    work={assignment,question:question.id,concept:question.concept_id};
    await reject('insert into assessments(tenant_id,student_id,concept_id,conversation_id,confidence) values($1,$2,$3,$4,0.8)',[tenant,student,work.concept,conversation],'採点対象');
    await reject("insert into answers(tenant_id,student_id,question_id,assignment_id,conversation_id,raw_answer) values($1,$2,$3,$4,$5,'好きなものの説明')",[tenant,student,work.question,work.assignment,conversation],'採点対象');
    expect((await db.query('select id from assessments where tenant_id=$1',[tenant])).rowCount).toBe(0);
  });
});
