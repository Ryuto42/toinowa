/**
 * RLS（行レベルセキュリティ）の境界テスト。
 *
 * アプリ側のチェックを全部すり抜けても、DBが最後に止めることを確かめる。
 * 「生徒が他人の記録を読めない」「先生が担当外を読めない」は
 * 機能が壊れるより重い事故なので、機能テストより先にここで守る。
 *
 * 実DBに接続する。DATABASE_URL が無い環境では丸ごとスキップする。
 * 作ったデータは必ずロールバックするので、既存のデータには触れない。
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

config({ path: '.env.local', quiet: true });

const connectionString = process.env.DATABASE_URL;
const run = connectionString ? describe : describe.skip;

run('RLS の境界', () => {
  const db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const ids = {
    tenantA: '', tenantB: '',
    classA: '', classB: '',
    teacherA: '', teacherB: '',
    studentA: '', studentB: '', studentOther: '',
    assignmentA: '', assessmentA: '', conversationA: '', handoffA: '',
  };

  /** 指定したユーザーとして読む。Supabase の authenticated ロールと同じ条件にする。 */
  async function asUser(userId: string, tenantId: string, role: 'student' | 'teacher' | 'admin') {
    const claims = JSON.stringify({ sub: userId, tenant_id: tenantId, app_role: role, role: 'authenticated' });
    await db.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await db.query('set local role authenticated');
  }
  async function asService() {
    await db.query('reset role');
  }
  async function countVisible(table: string, where: string, params: unknown[]): Promise<number> {
    const { rowCount } = await db.query(`select 1 from public.${table} where ${where}`, params);
    return rowCount ?? 0;
  }

  beforeAll(async () => {
    await db.connect();
    await db.query('begin');

    const mkTenant = async (name: string) =>
      (await db.query('insert into public.tenants(name) values($1) returning id', [name])).rows[0].id as string;
    // public.users は auth.users を参照するので、先に認証側の行を作る。
    // トランザクションごとロールバックするため、実際のログインには影響しない。
    const mkUser = async (tenant: string, role: string, name: string) => {
      const id = (await db.query('select gen_random_uuid() as id')).rows[0].id as string;
      await db.query(
        "insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
        [id, `rls-${id}@example.invalid`],
      );
      await db.query(
        'insert into public.users(id,tenant_id,role,display_name,status) values($1,$2,$3,$4,$5)',
        [id, tenant, role, name, 'active'],
      );
      return id;
    };
    const mkClass = async (tenant: string, name: string) =>
      (await db.query("insert into public.classrooms(tenant_id,name,subject) values($1,$2,'数学') returning id", [tenant, name])).rows[0].id as string;
    const enroll = (tenant: string, classroom: string, user: string, role: string) =>
      db.query('insert into public.enrollments(tenant_id,classroom_id,user_id,role,active) values($1,$2,$3,$4,true)', [tenant, classroom, user, role]);

    ids.tenantA = await mkTenant('RLS検証A');
    ids.tenantB = await mkTenant('RLS検証B');
    ids.classA = await mkClass(ids.tenantA, 'A組');
    ids.classB = await mkClass(ids.tenantA, 'B組');
    ids.teacherA = await mkUser(ids.tenantA, 'teacher', 'A組の先生');
    ids.teacherB = await mkUser(ids.tenantA, 'teacher', 'B組の先生');
    ids.studentA = await mkUser(ids.tenantA, 'student', 'A組の生徒');
    ids.studentOther = await mkUser(ids.tenantA, 'student', 'A組のもう一人');
    ids.studentB = await mkUser(ids.tenantB, 'student', '別の学校の生徒');
    await enroll(ids.tenantA, ids.classA, ids.teacherA, 'teacher');
    await enroll(ids.tenantA, ids.classB, ids.teacherB, 'teacher');
    await enroll(ids.tenantA, ids.classA, ids.studentA, 'student');
    await enroll(ids.tenantA, ids.classA, ids.studentOther, 'student');

    const lesson = (await db.query(
      "insert into public.lessons(tenant_id,classroom_id,title,status,created_by) values($1,$2,'割合','published',$3) returning id",
      [ids.tenantA, ids.classA, ids.teacherA])).rows[0].id;
    const concept = (await db.query(
      "insert into public.concepts(tenant_id,lesson_id,name) values($1,$2,'割合') returning id",
      [ids.tenantA, lesson])).rows[0].id;
    const question = (await db.query(
      "insert into public.questions(tenant_id,concept_id,difficulty,format,body) values($1,$2,2,'explain','説明してください') returning id",
      [ids.tenantA, concept])).rows[0].id;
    ids.assignmentA = (await db.query(
      "insert into public.assignments(tenant_id,lesson_id,classroom_id,student_id,question_ids,status,published_at) values($1,$2,$3,$4,array[$5::uuid],'published',now()) returning id",
      [ids.tenantA, lesson, ids.classA, ids.studentA, question])).rows[0].id;
    ids.conversationA = (await db.query(
      "insert into public.conversations(tenant_id,student_id,concept_id,channel,state) values($1,$2,$3,'web','active') returning id",
      [ids.tenantA, ids.studentA, concept])).rows[0].id;
    ids.assessmentA = (await db.query(
      "insert into public.assessments(tenant_id,student_id,concept_id,score,confidence,is_final) values($1,$2,$3,0.8,0.7,true) returning id",
      [ids.tenantA, ids.studentA, concept])).rows[0].id;
    // teacherA -> teacherB の引き継ぎ。当事者だけが読めることを確かめる。
    ids.handoffA = (await db.query(
      "insert into public.handoffs(tenant_id,student_id,from_user,to_user,note) values($1,$2,$3,$4,'申し送り') returning id",
      [ids.tenantA, ids.studentA, ids.teacherA, ids.teacherB])).rows[0].id;
  });

  // 拒否されるはずの書き込みを試すとトランザクションが中断するので、
  // テストごとにセーブポイントで区切る。
  beforeEach(async () => { await db.query('savepoint per_test'); });
  afterEach(async () => {
    await db.query('rollback to savepoint per_test').catch(() => {});
    await db.query('reset role').catch(() => {});
  });

  afterAll(async () => {
    await db.query('rollback').catch(() => {});
    await db.end().catch(() => {});
  });

  it('生徒は自分の課題を読める', async () => {
    await asUser(ids.studentA, ids.tenantA, 'student');
    expect(await countVisible('assignments', 'id = $1', [ids.assignmentA])).toBe(1);
    await asService();
  });

  it('生徒は同じクラスの他の生徒の課題を読めない', async () => {
    await asUser(ids.studentOther, ids.tenantA, 'student');
    expect(await countVisible('assignments', 'id = $1', [ids.assignmentA])).toBe(0);
    await asService();
  });

  it('生徒は自分の評価すら直接は読めない（点数は先生の画面を通す）', async () => {
    await asUser(ids.studentA, ids.tenantA, 'student');
    expect(await countVisible('assessments', 'id = $1', [ids.assessmentA])).toBe(0);
    await asService();
  });

  it('生徒は評価を書き込めない（スコアを偽造できない）', async () => {
    await asUser(ids.studentA, ids.tenantA, 'student');
    await expect(db.query(
      'insert into public.assessments(tenant_id,student_id,concept_id,score,confidence) values($1,$2,(select id from public.concepts limit 1),1,1)',
      [ids.tenantA, ids.studentA],
    )).rejects.toThrow();
  });

  it('担当している先生は自分のクラスの課題と評価を読める', async () => {
    await asUser(ids.teacherA, ids.tenantA, 'teacher');
    expect(await countVisible('assignments', 'id = $1', [ids.assignmentA])).toBe(1);
    expect(await countVisible('assessments', 'id = $1', [ids.assessmentA])).toBe(1);
    await asService();
  });

  it('担当外の先生は他クラスの課題も評価も読めない', async () => {
    await asUser(ids.teacherB, ids.tenantA, 'teacher');
    expect(await countVisible('assignments', 'id = $1', [ids.assignmentA])).toBe(0);
    expect(await countVisible('assessments', 'id = $1', [ids.assessmentA])).toBe(0);
    expect(await countVisible('conversations', 'id = $1', [ids.conversationA])).toBe(0);
    await asService();
  });

  it('別の学校の生徒には何も見えない', async () => {
    await asUser(ids.studentB, ids.tenantB, 'student');
    expect(await countVisible('assignments', 'id = $1', [ids.assignmentA])).toBe(0);
    expect(await countVisible('users', 'id = $1', [ids.studentA])).toBe(0);
    expect(await countVisible('classrooms', 'id = $1', [ids.classA])).toBe(0);
    await asService();
  });

  it('内部の表はログイン済みでも一切見えない', async () => {
    await asUser(ids.teacherA, ids.tenantA, 'teacher');
    for (const table of ['jobs', 'agent_runs', 'audit_logs', 'guard_events', 'ai_budget_ledger', 'model_disables']) {
      // 権限自体が無い場合は例外、ポリシーで弾かれる場合は0件。どちらでも「見えない」。
      const visible = await countVisible(table, 'tenant_id = $1', [ids.tenantA]).catch(() => 0);
      expect(visible).toBe(0);
    }
  });

  it('引き継ぎは当事者だけが読める', async () => {
    // 受け手はまだ担当していないので、担当クラスの条件では読めない。当事者として読める必要がある。
    await asUser(ids.teacherB, ids.tenantA, 'teacher');
    expect(await countVisible('handoffs', 'id = $1', [ids.handoffA])).toBe(1);
    await asService();
    await asUser(ids.teacherA, ids.tenantA, 'teacher');
    expect(await countVisible('handoffs', 'id = $1', [ids.handoffA])).toBe(1);
    await asService();
  });

  it('引き継ぎは無関係な人には見えない', async () => {
    await asUser(ids.studentA, ids.tenantA, 'student');
    expect(await countVisible('handoffs', 'id = $1', [ids.handoffA])).toBe(0);
    await asService();
    await asUser(ids.studentB, ids.tenantB, 'student');
    expect(await countVisible('handoffs', 'id = $1', [ids.handoffA])).toBe(0);
    await asService();
  });

  it('ログインしていなければ何も引けない', async () => {
    await db.query("select set_config('request.jwt.claims', '', true)");
    await db.query('set local role anon');
    await expect(countVisible('users', 'id = $1', [ids.studentA]).catch(() => 0)).resolves.toBe(0);
    await expect(countVisible('assignments', 'id = $1', [ids.assignmentA]).catch(() => 0)).resolves.toBe(0);
  });
});
