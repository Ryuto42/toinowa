import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import assert from 'node:assert/strict';
config({ path: '.env.local', quiet: true });

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const sql = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await sql.connect();
  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const suffix = crypto.randomUUID().slice(0, 8);
  const password = crypto.randomUUID() + 'Aa1!';
  const authIds: string[] = [];
  let tenantId: string | undefined;
  async function session(email: string, loginPassword = password) {
    const cookies = new Map<string,string>();
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{ cookies: { getAll: () => [...cookies].map(([name,value]) => ({name,value})), setAll: values => { for(const item of values) cookies.set(item.name,item.value); } } });
    const result = await client.auth.signInWithPassword({ email, password: loginPassword });
    if(result.error) throw result.error;
    return [...cookies].map(([name,value]) => `${name}=${value}`).join('; ');
  }
  async function api(cookie: string, path: string, body?: unknown, expected = 200, method?: 'PATCH') {
    const response = await fetch(`${base}${path}`,{ method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    assert.equal(response.status,expected,`${path}: ${data.message ?? data.error ?? response.status}`);
    return data;
  }
  try {
    const tenant = await db.from('tenants').insert({name:`動作検証-${suffix}`,ai_budget_limit_usd:process.env.SMOKE_AUTH_ONLY === '1' ? 0 : 0.5}).select('id').single();
    if(tenant.error) throw tenant.error;
    tenantId=tenant.data.id;
    const organizationCode = `smoke-${suffix}`;
    await sql.query('insert into school_codes(code,tenant_id) values($1,$2)', [organizationCode, tenantId]);
    const email = `smoke-admin-${suffix}@example.com`;
    const auth = await db.auth.admin.createUser({email,password,email_confirm:true});
    if(auth.error) throw auth.error;
    authIds.push(auth.data.user.id);
    const admin = await db.from('users').insert({id:auth.data.user.id,tenant_id:tenantId,role:'admin',display_name:'検証管理者',email});
    if(admin.error) throw admin.error;
    const cookie = await session(email);
    const classroom = { data: (await sql.query("insert into public.classrooms(tenant_id,name,subject,grade) values($1,'検証数学','数学','中学2年') returning id",[tenantId])).rows[0] };
    const teacherEmail=`smoke-teacher-${suffix}@example.com`;
    const teacher = await api(cookie,'/api/admin/users',{displayName:'検証先生',email:teacherEmail,password,role:'teacher'},201);
    authIds.push(teacher.user.id);
    const enrollment = await db.from('enrollments').insert({tenant_id:tenantId,classroom_id:classroom.data.id,user_id:teacher.user.id,role:'teacher'});
    if(enrollment.error) throw enrollment.error;
    const teacherInitialCookie = await session(teacherEmail, teacher.credentials.initialPassword);
    await api(teacherInitialCookie, '/api/auth/change-password', { currentPassword: teacher.credentials.initialPassword, password });
    const teacherCookie=await session(teacherEmail);
    const loginIdentifier=`student-${suffix}`;
    const student=await api(cookie,'/api/admin/users',{displayName:'検証生徒',loginIdentifier,role:'student',intake:{grade:'中学2年',learningGoal:'定期テストで一次関数の基礎を理解したい',examResults:'数学62/100、一次関数12/30',weakAreas:'傾きと切片の違い',dailyTimeLimitMin:15,classroomId:classroom.data.id}},201);
    authIds.push(student.user.id);
    assert(student.credentials.initialPassword.length >= 16);
    const registered = await db.from('users').select('email,must_change_password').eq('id', student.user.id).single();
    assert.equal(registered.data?.email, null);
    assert.equal(registered.data?.must_change_password, true);
    async function studentLogin(loginPassword: string) {
      const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationCode, identifier: loginIdentifier, password: loginPassword }) });
      assert.equal(response.status, 200, '所属コードとログインIDでログイン');
      return { result: await response.json(), cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
    }
    const first = await studentLogin(student.credentials.initialPassword);
    assert.equal(first.result.redirectTo, '/change-password');
    await api(first.cookie, '/api/students/me/tasks', undefined, 403);
    const gated = await fetch(`${base}/student/home`, { headers: { Cookie: first.cookie }, redirect: 'manual' });
    assert([302, 303, 307, 308].includes(gated.status), `初回ログインの画面誘導: HTTP ${gated.status}`);
    assert.equal(new URL(gated.headers.get('location')!, base).pathname, '/change-password');
    await sql.query('begin');
    try {
      await sql.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: student.user.id, tenant_id: tenantId, app_role: 'student' })]);
      await sql.query('set local role authenticated');
      assert.equal((await sql.query('select id from users where id=$1', [student.user.id])).rowCount, 0, '初期パスワードではDB APIも遮断');
    } finally { await sql.query('rollback'); }
    await api(first.cookie, '/api/auth/change-password', { currentPassword: student.credentials.initialPassword, password: student.credentials.initialPassword }, 400);
    await api(first.cookie, '/api/auth/change-password', { currentPassword: 'wrong-password', password }, 400);
    await api(first.cookie, '/api/auth/change-password', { currentPassword: student.credentials.initialPassword, password });
    const subsequent = await studentLogin(password);
    assert.equal(subsequent.result.mustChangePassword, false);
    assert.equal(subsequent.result.redirectTo, '/student/home');
    const studentCookie = subsequent.cookie;
    await api('', '/api/auth/login', { organizationCode, identifier: loginIdentifier, password: student.credentials.initialPassword }, 401);
    console.log('PASS: メールなし登録・初期パスワード生成・初回変更の強制・変更後の再ログイン・旧パスワード拒否');
    const profilePatch = { grade: '中学3年', learningGoal: '一次関数の応用を理解したい', examResults: '数学72/100、一次関数20/30', weakAreas: 'グラフと式の対応', dailyTimeLimitMin: 25 };
    await api(cookie, `/api/admin/users/${student.user.id}`, { displayName: '編集検証生徒', profile: profilePatch }, 200, 'PATCH');
    const edited = await db.from('student_profiles').select('grade,learning_goal,exam_results,weak_areas,daily_time_limit_min').eq('user_id', student.user.id).single();
    assert.equal(edited.data?.exam_results, profilePatch.examResults);
    assert.equal(edited.data?.weak_areas, profilePatch.weakAreas);
    assert.equal(edited.data?.daily_time_limit_min, 25);
    await api(studentCookie, `/api/admin/users/${student.user.id}`, { displayName: '不正更新' }, 403, 'PATCH');
    await api(teacherCookie, `/api/admin/users/${student.user.id}`, { profile: profilePatch }, 403, 'PATCH');
    await api(cookie, `/api/admin/users/${crypto.randomUUID()}`, { displayName: '不正更新' }, 404, 'PATCH');
    await api(cookie, `/api/admin/users/${student.user.id}`, { profile: { ...profilePatch, dailyTimeLimitMin: 0 } }, 400, 'PATCH');
    await sql.query("update users set login_identifier='reserved-id' where id=$1", [teacher.user.id]);
    await api(cookie, `/api/admin/users/${student.user.id}`, { displayName: '保存されてはいけない名前', loginIdentifier: 'reserved-id', profile: { ...profilePatch, examResults: '保存されてはいけない結果' } }, 400, 'PATCH');
    const unchanged = await db.from('users').select('display_name').eq('id', student.user.id).single();
    assert.equal(unchanged.data?.display_name, '編集検証生徒');
    const unchangedProfile = await db.from('student_profiles').select('exam_results').eq('user_id', student.user.id).single();
    assert.equal(unchangedProfile.data?.exam_results, profilePatch.examResults);
    console.log('PASS: 既存生徒の編集・保存内容・管理者限定・不正入力・重複IDでの更新取り消し');
    if (process.env.SMOKE_AUTH_ONLY === '1') {
      const secondAdmin = await api(cookie, '/api/admin/users', { displayName: '検証管理者2', email: `second-admin-${suffix}@example.com`, role: 'admin' }, 201);
      authIds.push(secondAdmin.user.id);
      assert(secondAdmin.credentials.initialPassword.length >= 16);
      await api(teacherCookie, `/api/admin/users/${student.user.id}/reset-password`, {}, 403);
      await api(cookie, `/api/admin/users/${crypto.randomUUID()}/reset-password`, {}, 404);
      for (const target of [student, teacher, secondAdmin]) {
        const reset = await api(cookie, `/api/admin/users/${target.user.id}/reset-password`, {});
        assert(reset.credentials.initialPassword.length >= 16);
        const loginResponse = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationCode, identifier: reset.credentials.loginIdentifier, password: reset.credentials.initialPassword }) });
        assert.equal(loginResponse.status, 200);
        const loginResult = await loginResponse.json();
        assert.equal(loginResult.mustChangePassword, true);
        const tempCookie = loginResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
        await api(tempCookie, '/api/admin/users', undefined, 403);
        await api(tempCookie, '/api/auth/change-password', { currentPassword: reset.credentials.initialPassword, password });
      }
      const stale = await fetch(`${base}/api/students/me/tasks`, { headers: { Cookie: studentCookie } });
      assert([401, 403].includes(stale.status), '再発行前のセッションは変更完了後も失効');
      const optional = await api(cookie, '/api/admin/users', { displayName: '任意項目空欄', role: 'student', loginIdentifier: `optional-${suffix}`, intake: { grade: '中2', classroomId: classroom.data.id } }, 201);
      authIds.push(optional.user.id);
      const optionalProfile = await db.from('student_profiles').select('learning_goal,weak_areas,daily_time_limit_min').eq('user_id', optional.user.id).single();
      assert.equal(optionalProfile.data?.learning_goal, ''); assert.equal(optionalProfile.data?.daily_time_limit_min, null);
      console.log('PASS: 全ロールの初期パスワード発行・再発行・変更強制・管理者限定・旧セッション失効・任意項目空欄登録');
      return;
    }
    console.log('PASS: 管理者登録・プロフィール・クラス所属・ロール認証');
    await api(studentCookie,'/api/assessments/run',{},403);
    const image='data:image/png;base64,'+(await readFile('tests/fixtures/mock-exam.png')).toString('base64');
    const extracted=await api(cookie,'/api/materials/extract',{purpose:'exam',images:[image]});
    assert.match(extracted.text,/62/);
    console.log('PASS: OrcaRouterによる模試画像の読み取り');
    const proposal=await api(teacherCookie,'/api/topics',{action:'propose',classroomId:classroom.data.id,content:'一次関数y=ax+bではaは傾き、bは切片である。xが1増えるとyはa増える。x=0のときy=b。'});
    assert(proposal.proposal.body);
    const work=await api(teacherCookie,'/api/topics',{action:'publish',classroomId:classroom.data.id,studentId:student.user.id,title:'傾きと切片',body:'一次関数の傾きと切片を、身近な例で教えてください。',content:'y=ax+bのaは傾き、bは切片。',difficulty:2,dueAt:new Date(Date.now()+86400000).toISOString()},201);
    console.log('PASS: 教材からのお題提案・先生による個別宿題配信');
    const conv=await api(studentCookie,'/api/conversations',{assignmentId:work.assignmentId,channel:'web'},201);
    const id=conv.conversation.id;
    const assignment=await db.from('assignments').select('question_ids').eq('id',work.assignmentId).single();
    assert(assignment.data);
    assert.equal((await api(studentCookie,`/api/conversations/${id}/feedback`)).status,'in_progress');
    const messages=['傾きはxが1増えたときのyの増え方です。切片はx=0のときのyです。','y=2x+3ならxが1増えるとyは2増え、最初の値は3です。','料金なら基本料金3円に1個あたり2円を加えます。','傾きが0なら料金は増えず、基本料金だけです。','傾きは増え方、切片は出発点です。','説明できてうれしいです。'];
    for(const content of messages) {
      const response=await api(studentCookie,`/api/conversations/${id}/messages`,{content,channel:'web',stream:false,assignmentId:work.assignmentId,questionId:assignment.data.question_ids[0]});
      assert(!('understandingLevel' in response));
      if(response.conversationCompleted) break;
    }
    let ready=false;
    for(let i=0;i<48;i++) {
      const feedback=await api(studentCookie,`/api/conversations/${id}/feedback`);
      if(feedback.status==='ready') { assert(!('score' in feedback.feedback)); ready=true; break; }
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
    if (!ready) { const jobs = await db.from('jobs').select('kind,status,last_error,attempt').eq('tenant_id',tenantId); console.log('Worker diagnostics:',JSON.stringify(jobs.data)); const state = await db.from('conversations').select('state,message_count').eq('id',id); console.log('Conversation diagnostics:',JSON.stringify(state.data)); }
    assert(ready,'完了後の評価が時間内に作成される');
    const teacherFeedback=await api(teacherCookie,`/api/students/${student.user.id}/mastery`);
    assert(teacherFeedback.concepts.length);
    const finalAssessment = await db.from('assessments').select('score,is_final').eq('tenant_id', tenantId).eq('conversation_id', id).single();
    if (finalAssessment.error) throw finalAssessment.error;
    assert(finalAssessment.data.is_final && finalAssessment.data.score !== null, '最終評価はAIの実応答から作成される');
    console.log('PASS: 対話完了・生徒の簡易FB・担当先生の詳細FB');
    const personalized = await api(teacherCookie, '/api/topics', { action: 'propose', classroomId: classroom.data.id, studentId: student.user.id, content: '今回の授業では一次関数のグラフと式の対応を学んだ。身近な具体例を説明する宿題にしたい。' });
    assert(personalized.proposal.body);
    assert.equal(personalized.history.conversationsUsed, 1);
    assert.equal(personalized.history.feedbackUsed, 1);
    await api(teacherCookie, '/api/topics', { action: 'propose', classroomId: classroom.data.id, studentId: crypto.randomUUID(), content: '一次関数' }, 403);
    console.log('PASS: 授業メモに過去の対話・FBを加えた個別のお題生成、対象生徒の権限確認');
    let followupReady = false;
    for (let i = 0; i < 40; i++) {
      const plans = await db.from('learning_plans').select('id').eq('tenant_id', tenantId).eq('student_id', student.user.id);
      if (plans.error) throw plans.error;
      if ((plans.data?.length ?? 0) >= 2) {
        const candidates = await db.from('assignments').select('id,status').eq('tenant_id', tenantId).not('source_plan_id', 'is', null);
        if (candidates.error) throw candidates.error;
        if ((candidates.data?.length ?? 0) >= 2) {
          assert(candidates.data!.every(item => item.status === 'pending_approval'));
          followupReady = true;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    assert(followupReady, '初期計画と対話後の計画が生成され、宿題候補は未配信のまま残る');
    console.log('PASS: 対話の評価を踏まえた次回計画・未配信の宿題候補');
    const pending=await api(teacherCookie,'/api/approvals');
    const homework=pending.approvals.find((item:{resource_type:string})=>item.resource_type==='assignment');
    assert(homework,'初期情報から宿題候補が生成される');
    await api(teacherCookie,`/api/approvals/${homework.id}/decision`,{decision:'approved',dueAt:new Date(Date.now()+86400000).toISOString()});
    const usage=await api(cookie,'/api/admin/usage?days=1');
    assert(usage.grouped.length);
    console.log('PASS: 学習計画・宿題候補・先生の承認・利用者別モデル集計');
  } finally {
    if(tenantId) {
      await sql.query('delete from public.jobs where tenant_id=$1',[tenantId]);
      await sql.query('delete from public.jobs_dead where tenant_id=$1',[tenantId]);
      await sql.query('delete from public.approvals where tenant_id=$1',[tenantId]);
      await sql.query('delete from public.student_profiles where tenant_id=$1',[tenantId]);
      await sql.query('delete from public.classrooms where tenant_id=$1',[tenantId]);
      for(const id of authIds.reverse()) {
        const deleted = await db.auth.admin.deleteUser(id);
        if (deleted.error) console.error('検証ユーザーの削除失敗:', deleted.error.message);
      }
      await sql.query('delete from public.tenants where id=$1',[tenantId]);
    }
    await sql.end();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
