import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
config({path:'.env.local',quiet:true});
const run=process.env.DATABASE_URL ? describe : describe.skip;
run('個別指導と管理者のアーカイブ・削除（全件ロールバック・AI呼び出しなし）',()=>{
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  let tenant:string, admin:string, teacher:string, outsider:string, student:string, other:string, personal:string, group:string, assignment:string, conversation:string, sharedConcept:string;
  async function reject(sql:string,args:unknown[],message:string) {
    await db.query('savepoint expected_error');
    try { await expect(db.query(sql,args)).rejects.toThrow(message); }
    finally { await db.query('rollback to savepoint expected_error'); }
  }
  async function manage(kind:string,id:string,action:string,confirmation='',fingerprint='') { return db.query('select manage_resource($1,$2,$3,$4,$5,$6,$7)',[tenant,admin,kind,id,action,confirmation,fingerprint]); }
  async function preview(kind:string,id:string) { return (await db.query('select managed_resource_preview($1,$2,$3,$4) as p',[tenant,admin,kind,id])).rows[0].p; }
  async function work(cls:string,target:string|null) { return (await db.query("select create_explanation_work($1,$2,$3,'傾き','傾きの意味を説明','一次関数',2,$4,null,true,now()+interval '1 day') as id",[tenant,teacher,cls,target])).rows[0].id as string; }
  beforeAll(async()=>{
    await db.connect();await db.query('begin');
    tenant=(await db.query("insert into tenants(name,ai_budget_limit_usd) values('個別指導テスト',0) returning id")).rows[0].id;
    const ids:string[]=[];
    for(const role of ['admin','teacher','teacher','student','student']) {
      const id=crypto.randomUUID();ids.push(id);
      await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",[id,`${id}@example.invalid`]);
      await db.query('insert into users(id,tenant_id,role,display_name) values($1,$2,$3,$4)',[id,tenant,role,role]);
    }
    [admin,teacher,outsider,student,other]=ids;
  });
  afterAll(async()=>{await db.query('rollback');await db.end();});
  it('クラス作成なしで生徒に担当を設定し、重複登録を防ぐ',async()=>{
    personal=(await db.query('select set_student_teachers($1,$2,$3,$4) as id',[tenant,admin,student,[teacher]])).rows[0].id;
    expect((await db.query('select set_student_teachers($1,$2,$3,$4) as id',[tenant,admin,student,[teacher,teacher]])).rows[0].id).toBe(personal);
    expect((await db.query('select user_id,role from enrollments where classroom_id=$1 and active',[personal])).rows).toHaveLength(2);
    await reject('select set_student_teachers($1,$2,$3,$4)',[tenant,teacher,student,[teacher]],'管理者');
    await reject('select set_student_teachers($1,$2,$3,$4)',[tenant,admin,student,[other]],'担当');
    await reject('select set_classroom_members($1,$2,$3,$4,$5)',[tenant,admin,personal,[teacher],[student,other]],'有効なクラス');
  });
  it('担当の先生だけが個別授業を準備でき、1人分だけ予約される',async()=>{
    const prep=crypto.randomUUID();
    await db.query("select queue_lesson_preparation($1,$2,$3,$4,'授業','傾きを学習',now()+interval '1 day')",[tenant,teacher,prep,personal]);
    expect((await db.query("select payload->>'studentId' as student from jobs where tenant_id=$1",[tenant])).rows).toEqual([{student}]);
    await reject("select queue_lesson_preparation($1,$2,$3,$4,'授業','傾きを学習',now()+interval '1 day')",[tenant,outsider,crypto.randomUUID(),personal],'担当');
    assignment=await work(personal,null);
    expect((await db.query('select student_id from assignments where id=$1',[assignment])).rows[0].student_id).toBe(student);
    const lesson=(await db.query('select lesson_id from assignments where id=$1',[assignment])).rows[0].lesson_id;
    conversation=(await db.query("insert into conversations(tenant_id,student_id,channel,lesson_id) values($1,$2,'web',$3) returning id",[tenant,student,lesson])).rows[0].id;
    await db.query("insert into messages(tenant_id,conversation_id,seq,actor,content_redacted,channel) values($1,$2,1,'student','傾きは変化です','web')",[tenant,conversation]);
  });
  it('担当外・別所属・生徒ロールから管理機能を実行できない',async()=>{
    for(const actor of [teacher,student]) await reject("select managed_resource_preview($1,$2,'student',$3)",[tenant,actor,student],'管理者');
    for(const actor of [teacher,outsider,student]) {
      await db.query('savepoint rls');
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,tenant_id:tenant,app_role:actor===student?'student':'teacher',role:'authenticated'})]);
      await db.query('set local role authenticated');
      const n=(await db.query('select count(*)::int as n from classrooms where id=$1',[personal])).rows[0].n;
      expect(n).toBe(actor===outsider?0:1);
      await db.query('rollback to savepoint rls');
    }
    expect((await db.query("select has_function_privilege('authenticated','manage_resource(uuid,uuid,text,uuid,text,text,text)','execute') as allowed")).rows[0].allowed).toBe(false);
    await reject("select managed_resource_preview($1,$2,'student',$3)",[crypto.randomUUID(),admin,student],'管理者');
  });
  it('更新履歴のある計画・評価・模試・AI実行記録も削除範囲へ含める',async()=>{
    const concept=(await db.query('select c.id from concepts c join assignments a on a.lesson_id=c.lesson_id where a.id=$1',[assignment])).rows[0].id;
    const assessment=(await db.query('insert into assessments(tenant_id,student_id,concept_id,conversation_id,confidence) values($1,$2,$3,$4,0.8) returning id',[tenant,student,concept,conversation])).rows[0].id;
    const plan=(await db.query("insert into learning_plans(tenant_id,student_id,classroom_id,source_assessment_id,period_start,period_end) values($1,$2,$3,$4,current_date,current_date+6) returning id",[tenant,student,personal,assessment])).rows[0].id;
    await db.query("insert into learning_plans(tenant_id,student_id,classroom_id,supersedes_plan_id,period_start,period_end) values($1,$2,$3,$4,current_date,current_date+6)",[tenant,student,personal,plan]);
    await db.query("insert into exam_analyses(id,tenant_id,created_by,student_id,status,images) values(gen_random_uuid(),$1,$2,$3,'completed','[]')",[tenant,admin,student]);
    const ai=(await db.query("insert into agent_runs(tenant_id,trace_id,agent_name,request_type,router_name,status,student_id,conversation_id) values($1,gen_random_uuid(),'test','test','test','ok',$2,$3) returning id",[tenant,student,conversation])).rows[0].id;
    await db.query("insert into guard_events(tenant_id,agent_run_id,student_id,conversation_id,source,category,rule) values($1,$2,$3,$4,'app_rule','test','test')",[tenant,ai,student,conversation]);
    const p=await preview('student',student);
    expect(p.counts).toMatchObject({plans:2,assessments:1,exams:1});
  });
  it('生徒のアーカイブでログインと新規書込を止め、履歴を残して復元できる',async()=>{
    await manage('student',student,'archive');
    expect((await db.query('select status,password_revision from users where id=$1',[student])).rows[0]).toMatchObject({status:'suspended',password_revision:1});
    expect((await preview('student',student)).counts).toMatchObject({assignments:1,conversations:1,messages:1,preparations:1});
    await reject("insert into messages(tenant_id,conversation_id,seq,actor,content_redacted,channel) values($1,$2,2,'student','追加','web')",[tenant,conversation],'停止');
    await reject("update users set status='active' where id=$1",[student],'復元');
    expect((await db.query('select status,state from jobs where tenant_id=$1',[tenant])).rows[0]).toMatchObject({status:'succeeded',state:{cancelledByArchive:true}});
    await manage('student',student,'restore');
    expect((await db.query('select status,archived_at from users where id=$1',[student])).rows[0]).toMatchObject({status:'active',archived_at:null});
  });
  it('クラスのアーカイブ・削除は個別指導や在籍者アカウントを消さない',async()=>{
    group=(await db.query("insert into classrooms(tenant_id,name,subject) values($1,'集合授業','数学') returning id",[tenant])).rows[0].id;
    await db.query('select set_classroom_members($1,$2,$3,$4,$5)',[tenant,admin,group,[teacher],[student,other]]);
    const groupWork=await work(group,null);
    const lesson=(await db.query('select lesson_id from assignments where id=$1',[groupWork])).rows[0].lesson_id;
    const groupConv=(await db.query("insert into conversations(tenant_id,student_id,channel,lesson_id) values($1,$2,'web',$3) returning id",[tenant,other,lesson])).rows[0].id;
    await db.query("insert into learning_plans(tenant_id,student_id,classroom_id,period_start,period_end,tasks,rationale) values($1,$2,$3,current_date,current_date+6,'[]','授業')",[tenant,other,group]);
    await reject("select manage_resource($1,$2,'classroom',$3,'delete','集合授業','x')",[tenant,admin,group],'アーカイブ');
    await manage('classroom',group,'archive');
    await reject("select create_explanation_work($1,$2,$3,'テーマ','説明','内容',2)",[tenant,teacher,group],'アーカイブ');
    await reject("update assignments set status='draft' where id=$1",[groupWork],'アーカイブ');
    await db.query('savepoint student_view');
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:other,tenant_id:tenant,app_role:'student',role:'authenticated'})]);
    await db.query('set local role authenticated');
    expect((await db.query('select count(*)::int as n from assignments where id=$1',[groupWork])).rows[0].n).toBe(0);
    await db.query('rollback to savepoint student_view');
    const p=await preview('classroom',group);
    expect(p.counts).toMatchObject({assignments:1,conversations:1,plans:1,members:2});
    await reject("select manage_resource($1,$2,'classroom',$3,'delete','違う名前',$4)",[tenant,admin,group,p.fingerprint],'名前');
    await manage('classroom',group,'delete',p.name,p.fingerprint);
    expect((await db.query('select id from conversations where id=$1',[groupConv])).rowCount).toBe(0);
    expect((await db.query('select id from learning_plans where classroom_id=$1',[group])).rowCount).toBe(0);
    expect((await db.query('select id from users where id=any($1::uuid[])',[[student,other]])).rowCount).toBe(2);
    expect((await db.query('select id from assignments where id=$1',[assignment])).rowCount).toBe(1);
  });
  it('個別に配信した内容でも他の生徒が学習に使っていれば共有内容を残す',async()=>{
    const cls=(await db.query("insert into classrooms(tenant_id,name,subject) values($1,'共有の数学','数学') returning id",[tenant])).rows[0].id;
    await db.query('select set_classroom_members($1,$2,$3,$4,$5)',[tenant,admin,cls,[teacher],[student,other]]);
    const id=await work(cls,student);
    sharedConcept=(await db.query('select c.id from concepts c join assignments a on a.lesson_id=c.lesson_id where a.id=$1',[id])).rows[0].id;
    await db.query('insert into assessments(tenant_id,student_id,concept_id,confidence) values($1,$2,$3,0.8)',[tenant,other,sharedConcept]);
    expect((await preview('student',student)).counts).toMatchObject({lessons:1,assignments:2,assessments:1});
  });
  it('影響再確認・実行中ジョブの完了を求め、生徒の認証情報まで削除する',async()=>{
    await manage('student',student,'archive');
    const before=await preview('student',student);
    await db.query("update jobs set status='leased',locked_until=now()+interval '1 minute' where tenant_id=$1",[tenant]);
    await reject("select manage_resource($1,$2,'student',$3,'delete','student',$4)",[tenant,admin,student,before.fingerprint],'処理中');
    await db.query("update jobs set status='succeeded',locked_until=null where tenant_id=$1",[tenant]);
    await reject("select manage_resource($1,$2,'student',$3,'delete','student','stale')",[tenant,admin,student],'再確認');
    const p=await preview('student',student);
    await manage('student',student,'delete',p.name,p.fingerprint);
    for(const table of ['users','auth.users']) expect((await db.query(`select id from ${table} where id=$1`,[student])).rowCount).toBe(0);
    expect((await db.query('select id from classrooms where id=$1',[personal])).rowCount).toBe(0);
    expect((await db.query('select id from conversations where id=$1',[conversation])).rowCount).toBe(0);
    for(const table of ['jobs','learning_plans','exam_analyses','agent_runs','guard_events']) expect((await db.query(`select id from ${table} where tenant_id=$1`,[tenant])).rowCount).toBe(0);
    expect((await db.query("select id from audit_logs where tenant_id=$1 and action='student.delete'",[tenant])).rowCount).toBe(1);
    expect((await db.query('select id from users where id=$1',[other])).rowCount).toBe(1);
    expect((await db.query('select id from assessments where tenant_id=$1',[tenant])).rowCount).toBe(1);
    expect((await db.query('select id from assessments where concept_id=$1 and student_id=$2',[sharedConcept,other])).rowCount).toBe(1);
  });
});
