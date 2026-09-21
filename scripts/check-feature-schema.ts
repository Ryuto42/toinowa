// テスト用データと未適用DDLは、成功・失敗にかかわらずロールバックする。
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { Client } from 'pg';
import assert from 'node:assert/strict';
config({ path: '.env.local', quiet: true });
async function main() {
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query('begin');
  for (const file of ['0017_feedback_privacy.sql','0018_student_planning.sql','0019_explanation_work.sql','0021_learning_service_grants.sql','0024_lease_safe_failure.sql','0031_undo_last_exchange.sql','0032_scope_teacher_write_policies.sql']) {
    const applied = await db.query('select 1 from private.schema_migrations where name=$1', [file]);
    if (!applied.rowCount) await db.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  const users = await db.query("select id,tenant_id,role from public.users where status='active' and role in ('admin','student')");
  const admin = users.rows.find(row => row.role === 'admin' && users.rows.some(s => s.role === 'student' && s.tenant_id === row.tenant_id));
  assert(admin, '同一学校の管理者と生徒が必要です');
  const student = users.rows.find(row => row.role === 'student' && row.tenant_id === admin.tenant_id);
  const tenant = admin.tenant_id;
  const classroom = (await db.query("insert into public.classrooms(tenant_id,name,subject) values($1,'検証用・ロールバック','数学') returning id", [tenant])).rows[0].id;
  await db.query("insert into public.enrollments(tenant_id,classroom_id,user_id,role) values($1,$2,$3,'student')", [tenant,classroom,student.id]);
  const plan = (await db.query("insert into public.learning_plans(tenant_id,student_id,period_start,period_end) values($1,$2,current_date,current_date+6) returning id", [tenant,student.id])).rows[0].id;
  const args = [tenant,admin.id,classroom,'割合','割合を具体例で説明してください','割合の基本',2,student.id,plan,false];
  const create = 'select public.create_explanation_work($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id';
  const assignment = (await db.query(create,args)).rows[0].id;
  assert.equal((await db.query(create,args)).rows[0].id,assignment, '再実行で重複しない');
  const claims = JSON.stringify({ sub: student.id, tenant_id: tenant, app_role: 'student', role: 'authenticated' });
  await db.query("select set_config('request.jwt.claims',$1,true)",[claims]);
  await db.query('set local role authenticated');
  assert.equal((await db.query('select id from public.assignments where id=$1',[assignment])).rowCount,0,'下書きの課題は生徒へ見えない');
  assert.equal((await db.query('select id from public.learning_plans where id=$1',[plan])).rowCount,0,'計画表は生徒へ見えない');
  await db.query('reset role');
  // 承認プロセスは廃止したので、下書きは先生が期限を決めて公開する（/api/topics/[id] と同じ更新）。
  await db.query("update public.assignments set status='published', published_at=now(), due_at=now()+interval '1 day' where id=$1",[assignment]);
  await db.query("update public.lessons set status='published' where id=(select lesson_id from public.assignments where id=$1)",[assignment]);
  const saved = (await db.query('select status,due_at from public.assignments where id=$1',[assignment])).rows[0];
  assert.equal(saved.status,'published'); assert(saved.due_at);
  await db.query('set local role authenticated');
  assert.equal((await db.query('select id from public.assignments where id=$1',[assignment])).rowCount,1,'公開後に対象生徒が参照できる');
  assert.equal((await db.query('select id from public.assessments where student_id=$1',[student.id])).rowCount,0,'生徒から詳細評価への直接アクセスを遮断');
  await db.query('reset role');
  const concept = (await db.query('select q.concept_id from public.questions q join public.assignments a on q.id=any(a.question_ids) where a.id=$1',[assignment])).rows[0].concept_id;
  assert(concept);
  const job = (await db.query("insert into public.jobs(tenant_id,kind,idempotency_key,status,lease_token) values($1,'test_lease',gen_random_uuid()::text,'leased',gen_random_uuid()) returning id,lease_token", [tenant])).rows[0];
  assert.equal((await db.query('select public.fail_leased_job($1,gen_random_uuid(),$2) as removed', [job.id,'stale worker'])).rows[0].removed, false, '古いリースはジョブを退避できない');
  assert.equal((await db.query('select id from public.jobs where id=$1', [job.id])).rowCount, 1);
  assert.equal((await db.query('select public.fail_leased_job($1,$2,$3) as removed', [job.id,job.lease_token,'blocked input'])).rows[0].removed, true, '現在のリースだけが退避できる');
  assert.equal((await db.query('select id from public.jobs where id=$1', [job.id])).rowCount, 0);
  assert.equal((await db.query('select last_error from public.jobs_dead where id=$1', [job.id])).rows[0].last_error, 'blocked input');
  assert.equal((await db.query("select has_function_privilege('authenticated','public.fail_leased_job(uuid,uuid,text)','execute') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.fail_job_permanently(uuid,text)','execute') as allowed")).rows[0].allowed, false);
  // 取り消しRPCは最後の1往復だけを消す
  const conversation = (await db.query("insert into public.conversations(tenant_id,student_id,concept_id,channel,state,message_count) values($1,$2,$3,'web','active',2) returning id",[tenant,student.id,concept])).rows[0].id;
  await db.query("insert into public.messages(tenant_id,conversation_id,seq,actor,content_redacted,channel) values($1,$2,1,'agent','お題','web'),($1,$2,2,'student','間違えた説明','web')",[tenant,conversation]);
  const undone = (await db.query('select * from public.undo_last_exchange($1,$2,$3)',[tenant,student.id,conversation])).rows[0];
  assert.equal(undone.restored_text,'間違えた説明','取り消した文章を返す');
  assert.equal((await db.query('select seq from public.messages where conversation_id=$1',[conversation])).rowCount,1,'AIの最初の問いかけは残る');
  assert.equal((await db.query("select has_function_privilege('authenticated','public.undo_last_exchange(uuid,uuid,uuid)','execute') as allowed")).rows[0].allowed,false);
  console.log('PASS: リース所有権・失敗退避・旧RPC無効化 / DDL / お題の原子的作成 / 冪等性 / 公開・配信 / 計画・詳細評価の非公開 / 送信の取り消し');
} finally { await db.query('rollback'); await db.end(); }

}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
