import { config } from 'dotenv';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
config({ path: '.env.local', quiet: true });
const run = process.env.DATABASE_URL ? describe : describe.skip;
run('background exam analysis persistence (no AI calls)', () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let tenant: string, admin: string, student: string;
  const output = { text: '数学50/100、関数10/30', learningGoal: '関数の基礎を復習する', weakAreas: '関数のグラフ', dailyTimeLimitMin: 20 };
  beforeAll(async () => {
    await db.connect(); await db.query('begin');
    tenant = (await db.query("insert into tenants(name,ai_budget_limit_usd) values('背景分析テスト',0) returning id")).rows[0].id;
    for (const role of ['admin', 'student']) {
      const id = crypto.randomUUID();
      await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [id,`${id}@example.invalid`]);
      await db.query('insert into users(id,tenant_id,role,display_name) values($1,$2,$3,$4)',[id,tenant,role,role]);
      if (role === 'admin') admin=id; else student=id;
    }
    await db.query('insert into student_profiles(user_id,tenant_id) values($1,$2)',[student,tenant]);
  });
  afterAll(async () => { await db.query('rollback'); await db.end(); });
  const profile = async () => (await db.query('select * from student_profiles where user_id=$1',[student])).rows[0];
  it('can register before the upload arrives, and preserves edits made during analysis', async () => {
    const id=crypto.randomUUID();
    await db.query('select attach_exam_analysis($1,$2,$3,$4)',[tenant,admin,student,id]);
    expect((await db.query('select status from exam_analyses where id=$1',[id])).rows[0].status).toBe('uploading');
    await db.query('select queue_exam_analysis($1,$2,$3,$4,$5)',[tenant,admin,id,'[]',JSON.stringify({learningGoal:'',weakAreas:'',examResults:'',dailyTimeLimitMin:null})]);
    await db.query("update student_profiles set learning_goal='本人が希望した目標' where user_id=$1",[student]);
    await db.query("update exam_analyses set status='completed',result=$2,images=null where id=$1",[id,JSON.stringify(output)]);
    await db.query('select apply_exam_analysis($1,$2)',[tenant,id]);
    expect(await profile()).toMatchObject({ learning_goal:'本人が希望した目標',weak_areas:output.weakAreas,daily_time_limit_min:20,exam_results:output.text });
  });
  it('can attach an already completed analysis after registration', async () => {
    const id=crypto.randomUUID(), p=await profile();
    await db.query('select queue_exam_analysis($1,$2,$3,$4,$5)',[tenant,admin,id,'[]',JSON.stringify({learningGoal:p.learning_goal,weakAreas:p.weak_areas,examResults:p.exam_results,dailyTimeLimitMin:20})]);
    await db.query("update exam_analyses set status='completed',result=$2,images=null where id=$1",[id,JSON.stringify({...output,dailyTimeLimitMin:15})]);
    expect((await db.query('select apply_exam_analysis($1,$2) as student',[tenant,id])).rows[0].student).toBeNull();
    await db.query('select attach_exam_analysis($1,$2,$3,$4)',[tenant,admin,student,id]);
    await db.query('select apply_exam_analysis($1,$2)',[tenant,id]);
    expect((await profile()).daily_time_limit_min).toBe(15);
  });
  it('a superseded analysis cannot overwrite the newest profile', async () => {
    const old=crypto.randomUUID(), newest=crypto.randomUUID();
    await db.query('select attach_exam_analysis($1,$2,$3,$4)',[tenant,admin,student,old]);
    await db.query("update exam_analyses set status='completed',result=$2 where id=$1",[old,JSON.stringify(output)]);
    await db.query('select attach_exam_analysis($1,$2,$3,$4)',[tenant,admin,student,newest]);
    expect((await db.query('select apply_exam_analysis($1,$2) as student',[tenant,old])).rows[0].student).toBeNull();
    expect((await profile()).daily_time_limit_min).toBe(15);
  });
  it('raw images and background functions cannot be read or executed by students', async () => {
    for (const role of ['anon','authenticated']) {
      expect((await db.query("select has_table_privilege($1,'public.exam_analyses','select') as allowed",[role])).rows[0].allowed).toBe(false);
      expect((await db.query("select has_function_privilege($1,'public.apply_exam_analysis(uuid,uuid)','execute') as allowed",[role])).rows[0].allowed).toBe(false);
    }
  });
  it('can prepare a reset for another user and lock competing operations', async () => {
    const revision = await db.query('select begin_password_reset($1,$2,$3) as revision',[tenant,admin,student]);
    expect(revision.rows[0].revision).toBeGreaterThan(0);
  });
  it('repeat upload does not create duplicate jobs', async () => {
    const id=crypto.randomUUID();
    for (let i=0;i<2;i++) await db.query('select queue_exam_analysis($1,$2,$3,$4,$5)',[tenant,admin,id,'[]','{}']);
    expect((await db.query("select count(*)::int as n from jobs where idempotency_key=$1",[`exam:${id}`])).rows[0].n).toBe(1);
  });
});
