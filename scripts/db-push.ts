/**
 * supabase/migrations/*.sql を番号順に適用する。
 *
 *   npx tsx scripts/db-push.ts            … 未適用のものだけ流す
 *   npx tsx scripts/db-push.ts --dry-run  … 何が流れるかだけ表示
 *   npx tsx scripts/db-push.ts --only 0010 … 特定のファイルだけ流す
 *
 * 適用済みの記録は private.schema_migrations に残すので、再実行しても二重適用しない。
 * Supabase CLI / Docker を使わずに済ませるための最小実装。
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL が未設定です。\n' +
        'Supabase ダッシュボード → Connect → Direct → Session pooler の接続文字列を\n' +
        '.env.local の DATABASE_URL に設定してください。',
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    // Supabase の pooler は TLS 必須。自己署名ではないが CA チェーンを持たない環境があるため緩める。
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    create schema if not exists private;
    create table if not exists private.schema_migrations (
      name       text primary key,
      sha256     text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query<{ name: string; sha256: string }>(
    'select name, sha256 from private.schema_migrations',
  );
  const applied = new Map(rows.map((r) => [r.name, r.sha256]));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => (only ? f.startsWith(only) : true))
    .sort();

  let count = 0;
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sha = createHash('sha256').update(sql).digest('hex');
    const prev = applied.get(file);

    if (prev === sha) {
      console.log(`  skip    ${file}`);
      continue;
    }
    if (prev && prev !== sha) {
      // 適用済みファイルを後から編集するのは事故のもと。
      // 新しい番号のファイルを足すこと。
      console.error(
        `  ✗ ${file} は適用済みだが内容が変わっている。\n` +
          '    適用済みマイグレーションは編集せず、新しい番号のファイルを追加してください。',
      );
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      console.log(`  would apply ${file} (${sql.split('\n').length} lines)`);
      continue;
    }

    process.stdout.write(`  apply   ${file} ... `);
    try {
      // マイグレーション1ファイル = 1トランザクション。
      // 途中で失敗したら中途半端な状態を残さない。
      await client.query('begin');
      await client.query(sql);
      await client.query(
        `insert into private.schema_migrations (name, sha256) values ($1, $2)
         on conflict (name) do update set sha256 = excluded.sha256, applied_at = now()`,
        [file, sha],
      );
      await client.query('commit');
      console.log('ok');
      count++;
    } catch (err) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`\n${(err as Error).message}\n`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log(dryRun ? '\ndry-run 完了' : `\n${count} 件のマイグレーションを適用しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
