import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const tenantId = 'a44c1a61-1c36-468c-9ced-912fbe10e382';
const teacherId = '4180915f-35d2-4977-a43d-7b79dc54ca77';
const studentId = '291e03b8-e692-49e1-8a90-83327d12429e';
const subjects = [
  { subject: '国語', classroom: '国語1-A', lesson: '現代文・論理読解', concept: '主張と根拠', question: '本文の筆者の主張を、根拠となる表現とともに説明してください。' },
  { subject: '英語', classroom: '英語1-A', lesson: '英文読解・要点把握', concept: '段落の要旨', question: '段落全体の要点を、本文中の表現を一つ引用して説明してください。' },
  { subject: '理科', classroom: '理科1-A', lesson: '生物の観察', concept: '観察結果と考察', question: '観察した結果と、そこから考えられる理由を分けて説明してください。' },
  { subject: '社会', classroom: '日本の地理', lesson: '資料から地域を読む', concept: '統計資料の読み取り', question: '資料から読み取れる地域の特色を、数値を一つ使って説明してください。' },
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const item of subjects) {
      const classroomResult = await client.query<{ id: string }>(
        'select id from classrooms where tenant_id = $1 and name = $2 limit 1',
        [tenantId, item.classroom],
      );
      const classroomId = classroomResult.rows[0]?.id ?? (await client.query<{ id: string }>(
        'insert into classrooms (tenant_id, name, subject, grade) values ($1, $2, $3, $4) returning id',
        [tenantId, item.classroom, item.subject, '高校1年'],
      )).rows[0].id;
      await client.query(
        'update classrooms set subject = $3, grade = $4 where tenant_id = $1 and id = $2',
        [tenantId, classroomId, item.subject, '高校1年'],
      );
      for (const [userId, role] of [[teacherId, 'teacher'], [studentId, 'student']] as const) {
        await client.query(
          `insert into enrollments (tenant_id, classroom_id, user_id, role, active)
           values ($1, $2, $3, $4::user_role, true)
           on conflict (classroom_id, user_id) do update set active = true, role = excluded.role`,
          [tenantId, classroomId, userId, role],
        );
      }
      const lessonResult = await client.query<{ id: string }>(
        'select id from lessons where tenant_id = $1 and classroom_id = $2 and title = $3 limit 1',
        [tenantId, classroomId, item.lesson],
      );
      const lessonId = lessonResult.rows[0]?.id ?? (await client.query<{ id: string }>(
        `insert into lessons (tenant_id, classroom_id, title, taught_at, objectives, status, created_by)
         values ($1, $2, $3, current_date, $4::jsonb, 'published', $5) returning id`,
        [tenantId, classroomId, item.lesson, JSON.stringify([`${item.subject}の考え方を自分の言葉で説明する`]), teacherId],
      )).rows[0].id;
      const conceptResult = await client.query<{ id: string }>(
        'select id from concepts where tenant_id = $1 and lesson_id = $2 and name = $3 limit 1',
        [tenantId, lessonId, item.concept],
      );
      const conceptId = conceptResult.rows[0]?.id ?? (await client.query<{ id: string }>(
        `insert into concepts (tenant_id, lesson_id, name, description, rubric, order_index)
         values ($1, $2, $3, $4, $5::jsonb, 0) returning id`,
        [tenantId, lessonId, item.concept, `${item.subject}の理解を対話で確かめます。`, JSON.stringify({ levels: [{ level: 3, descriptor: '根拠を示して説明できる' }, { level: 2, descriptor: '要点を説明できる' }, { level: 1, descriptor: '用語を確認できる' }] })],
      )).rows[0].id;
      const questionResult = await client.query<{ id: string }>(
        'select id from questions where tenant_id = $1 and concept_id = $2 and body = $3 limit 1',
        [tenantId, conceptId, item.question],
      );
      const questionId = questionResult.rows[0]?.id ?? (await client.query<{ id: string }>(
        `insert into questions (tenant_id, concept_id, difficulty, format, body, expected_answer, grading_rubric, hints, is_transfer, approved_by, approved_at)
         values ($1, $2, 2, 'explain', $3, $4::jsonb, $5::jsonb, $6::jsonb, false, $7, now()) returning id`,
        [tenantId, conceptId, item.question, JSON.stringify({ type: 'text', description: '概念の核・論理のつながり・具体例を含む説明' }), JSON.stringify({ criteria: ['概念の定義と核', '理由・論理のつながり', '具体例やたとえ', '読み手への明瞭さ'] }), JSON.stringify(['まず概念が何を表すかを一文で書く', 'なぜそうなるかを理由でつなぐ', '身近なたとえを一つ加える']), teacherId],
      )).rows[0].id;
      await client.query(
        `update questions
         set format = 'explain',
             grading_rubric = $3::jsonb,
             expected_answer = $4::jsonb,
             hints = $5::jsonb
         where tenant_id = $1 and concept_id = $2`,
        [tenantId, conceptId, JSON.stringify({ criteria: ['概念の定義と核', '理由・論理のつながり', '具体例やたとえ', '読み手への明瞭さ'] }), JSON.stringify({ type: 'text', description: '概念を相手へ伝える説明' }), JSON.stringify(['概念が何を表すかを一文で書く', '理由やつながりを示す', 'たとえや具体例を加える'])],
      );
      await client.query(
        `insert into assignments (tenant_id, lesson_id, classroom_id, question_ids, kind, status, due_at, published_at, approved_by)
         select $1, $2, $3, $4::uuid[], 'initial', 'published', now() + interval '14 days', now(), $5
         where not exists (select 1 from assignments where tenant_id = $1 and lesson_id = $2 and classroom_id = $3)`,
        [tenantId, lessonId, classroomId, [questionId], teacherId],
      );
      console.log(`${item.subject}: ${classroomId} / ${lessonId} / ${conceptId} / ${questionId}`);
    }
    const mathConcept = await client.query<{ id: string }>(
      'select id from concepts where tenant_id = $1 and name = $2 limit 1',
      [tenantId, '傾きと切片'],
    );
    if (mathConcept.rows[0]) {
      await client.query(
        `update questions
         set format = 'explain',
             body = $3,
             expected_answer = $4::jsonb,
             grading_rubric = $5::jsonb,
             hints = $6::jsonb
         where tenant_id = $1 and concept_id = $2`,
        [
          tenantId,
          mathConcept.rows[0].id,
          '一次関数の「傾き」と「切片」がそれぞれ何を表すのか、私に教えてください。グラフや身近なたとえを一つ使い、二つの関係にも触れましょう。',
          JSON.stringify({ type: 'text', description: '傾きと切片の意味・関係を相手へ伝える説明' }),
          JSON.stringify({ criteria: ['傾きの意味', '切片の意味', '二つの関係', '具体例やたとえ', '読み手への明瞭さ'] }),
          JSON.stringify(['グラフでどの方向の変化を表すか考える', 'xが0のときの値に注目する', '二つを一つのグラフの説明につなげる']),
        ],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
