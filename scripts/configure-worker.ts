/**
 * pg_cron → pg_net → Vercel のワーカー呼び出しを有効にする。
 *
 * private.app_config が空だと private.tick_worker() は毎回何もせず戻るため、
 * ジョブの再試行・リース回収・dead-letter が一切動かない（cron のログ上は成功する）。
 * デプロイ後に一度だけ実行すること。値は .env.local から取る。
 *
 *   npx tsx scripts/configure-worker.ts                         # .env.local の APP_BASE_URL を使う
 *   npx tsx scripts/configure-worker.ts --url=https://例.vercel.app
 *   npx tsx scripts/configure-worker.ts --status   # 今の状態だけ見る
 */
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

async function main() {

  const statusOnly = process.argv.includes('--status');
  // デプロイ先のURLは .env.local と違うことがあるので、引数で上書きできるようにする。
  const override = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6);
  const base = override ?? process.env.APP_BASE_URL;
  const secret = process.env.WORKER_SECRET;

  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const current = await db.query<{ key: string; value: string }>('select key, value from private.app_config order by key');
    const shown = current.rows.map((row) => `${row.key}=${row.key.includes('secret') ? '***' : row.value}`);
    console.log('現在の設定:', shown.length ? shown.join(' / ') : '(未設定)');

    if (statusOnly) process.exit(0);

    if (!base || !secret) {
      console.error('APP_BASE_URL と WORKER_SECRET を .env.local に設定してください。');
      process.exit(1);
    }
    if (base.includes('localhost')) {
      console.error(`APP_BASE_URL が ${base} です。Supabase から届かないので、デプロイ先のURLを指定してください。`);
      process.exit(1);
    }

    const url = `${base.replace(/\/+$/, '')}/api/internal/worker/tick`;
    await db.query(
      `insert into private.app_config (key, value) values ('worker_url', $1), ('worker_secret', $2)
       on conflict (key) do update set value = excluded.value`,
      [url, secret],
    );
    console.log('設定しました:', url);
    console.log('10秒以内に cron が動き出します。cron.job_run_details で確認できます。');
  } finally {
    await db.end();
  }
}

void main();
