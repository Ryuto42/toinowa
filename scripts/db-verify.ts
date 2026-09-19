/** スキーマ適用結果の確認。`npx tsx scripts/db-verify.ts` */
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const tables = await c.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='public' order by 1",
  );
  console.log(`public テーブル数: ${tables.rows.length}`);
  console.log('  ' + tables.rows.map((r) => r.tablename).join(', '));

  const noRls = await c.query<{ relname: string }>(
    `select relname from pg_class
     where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity`,
  );
  console.log(
    `\nRLS未有効のテーブル: ${noRls.rows.length ? noRls.rows.map((r) => r.relname).join(', ') : 'なし ✅'}`,
  );

  const pol = await c.query<{ n: number }>(
    "select count(*)::int n from pg_policies where schemaname='public'",
  );
  console.log(`ポリシー数: ${pol.rows[0].n}`);

  // ポリシーが1つも無い = service role 専用テーブル（意図通りか確認する）
  const noPolicy = await c.query<{ relname: string }>(
    `select c.relname from pg_class c
     where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relrowsecurity
       and not exists (select 1 from pg_policies p
                       where p.schemaname='public' and p.tablename=c.relname)
     order by 1`,
  );
  console.log(
    `\nポリシー無し（= service role 専用。authenticated からは0行）:\n  ` +
      noPolicy.rows.map((r) => r.relname).join(', '),
  );

  const cron = await c.query("select jobname, schedule, active from cron.job order by jobname");
  console.log('\ncron ジョブ:');
  console.table(cron.rows);

  const fn = await c.query(
    `select n.nspname as schema, p.proname as name
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname in ('private','public')
       and p.proname in ('claim_jobs','match_material_chunks','search_material_chunks_text',
                         'custom_access_token_hook','my_classrooms','teaches_student',
                         'current_tenant','current_role','tick_worker','bump_ai_budget',
                         'today_ai_spend','fail_job_permanently')
     order by 1,2`,
  );
  console.log('\n定義済み関数:');
  console.table(fn.rows);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
