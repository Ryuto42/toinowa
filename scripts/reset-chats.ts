/**
 * デモ用に学習の記録だけを消す。お題（説明ワーク）とアカウントは残す。
 *
 * 消すもの: 会話・メッセージ・回答・AI評価・進捗・介入・学習計画・復習予定・通知・ジョブ
 * 残すもの: テナント / ユーザー / クラス / 在籍 / lessons / concepts / questions / 公開中のassignments
 *
 * 併せて assignments を「未開封」に戻す:
 *   - 進捗行を消す（行が無い = 未着手）
 *   - completed のものを published に戻す
 *   - AIが自動生成した下書き（source_plan_id 付き）は計画ごと消す
 *
 *   npx tsx scripts/reset-chats.ts --dry-run   # 件数だけ見る
 *   npx tsx scripts/reset-chats.ts --yes       # 実行する
 */
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

async function main() {

  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--yes');

  const COUNTS = [
    ['会話', 'conversations'],
    ['メッセージ', 'messages'],
    ['回答', 'answers'],
    ['AI評価', 'assessments'],
    ['課題の進捗', 'assignment_progress'],
    ['介入', 'escalations'],
    ['学習計画', 'learning_plans'],
    ['復習予定', 'review_schedules'],
    ['通知', 'notifications'],
    ['ジョブ', 'jobs'],
    ['失敗ジョブ', 'jobs_dead'],
    ['AI実行ログ', 'agent_runs'],
  ] as const;

  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    for (const [label, table] of COUNTS) {
      const { rows } = await db.query<{ n: string }>(`select count(*)::text as n from public.${table}`);
      console.log(`${label}: ${rows[0].n}件`);
    }
    const drafts = await db.query<{ n: string }>(
      "select count(*)::text as n from public.assignments where source_plan_id is not null",
    );
    const done = await db.query<{ n: string }>(
      "select count(*)::text as n from public.assignments where status <> 'published'",
    );
    console.log(`AI生成の下書き課題: ${drafts.rows[0].n}件（削除対象）`);
    console.log(`published 以外の課題: ${done.rows[0].n}件（published に戻す）`);

    if (dryRun) {
      console.log('\n--dry-run です。実行するには --yes を付けてください。');
      process.exit(0);
    }

    await db.query('begin');
    // 依存の深い順に消す。assessments は conversations を参照するので先に。
    await db.query('delete from public.assessments');
    await db.query('delete from public.messages');
    await db.query('delete from public.conversations');
    await db.query('delete from public.answers');
    await db.query('delete from public.assignment_progress');
    await db.query('delete from public.escalations');
    await db.query('delete from public.review_schedules');
    await db.query('delete from public.notifications');
    await db.query('delete from public.jobs');
    await db.query('delete from public.jobs_dead');
    await db.query('delete from public.agent_runs');

    // 計画から生えた課題は、お題・概念・授業ごと消す（手で作ったお題は残す）
    await db.query(`
      with generated as (delete from public.assignments where source_plan_id is not null returning lesson_id, question_ids),
           q as (delete from public.questions where id in (select unnest(question_ids) from generated) returning concept_id)
      delete from public.concepts where id in (select concept_id from q)
    `);
    await db.query(`
      delete from public.lessons l
      where not exists (select 1 from public.assignments a where a.lesson_id = l.id)
    `);
    await db.query('delete from public.learning_plans');

    // 残った課題は未開封の公開中に戻す
    await db.query("update public.assignments set status = 'published' where status <> 'published'");
    await db.query('update public.student_profiles set streak_days = 0, last_active_on = null');
    await db.query('commit');

    console.log('\nリセットしました。すべての説明ワークが未着手の状態に戻っています。');
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

void main();
