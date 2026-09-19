/**
 * DB のカタログから TypeScript 型を生成する。
 *
 *   npm run db:types
 *
 * `supabase gen types` は Docker を要求するため使わない。
 * pg_catalog を直接読めば同じものが作れるし、追加の認証情報も要らない。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });

/** Postgres の型 → TypeScript の型。ここに無いものは unknown にして気付けるようにする */
const TYPE_MAP: Record<string, string> = {
  bool: 'boolean',
  int2: 'number', int4: 'number', int8: 'number',
  float4: 'number', float8: 'number', numeric: 'number',
  text: 'string', varchar: 'string', citext: 'string', bpchar: 'string',
  uuid: 'string', date: 'string', time: 'string',
  timestamp: 'string', timestamptz: 'string',
  json: 'Json', jsonb: 'Json',
  bytea: 'string', inet: 'string', vector: 'number[]',
  interval: 'string',
};

interface Col {
  table: string;
  name: string;
  udt: string;
  isArray: boolean;
  notNull: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  enumName: string | null;
  comment: string | null;
}

function tsType(c: Col, enums: Set<string>): string {
  const base = c.enumName && enums.has(c.enumName)
    ? pascal(c.enumName)
    : (TYPE_MAP[c.udt] ?? 'unknown');
  return c.isArray ? `${base}[]` : base;
}

const pascal = (s: string) =>
  s.split(/[_\s]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // ── enum ──
  const enumRows = await c.query<{ name: string; labels: string[] }>(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname
  `);
  const enumNames = new Set(enumRows.rows.map((r) => r.name));

  // ── 列 ──
  const colRows = await c.query<Col>(`
    select
      cl.relname                      as "table",
      a.attname                       as "name",
      coalesce(bt.typname, t.typname) as "udt",
      (t.typcategory = 'A')           as "isArray",
      a.attnotnull                    as "notNull",
      a.atthasdef                     as "hasDefault",
      (a.attidentity <> '' or a.attgenerated <> '') as "isGenerated",
      case when coalesce(bt.typtype, t.typtype) = 'e'
           then coalesce(bt.typname, t.typname) end as "enumName",
      col_description(cl.oid, a.attnum) as "comment"
    from pg_attribute a
    join pg_class cl on cl.oid = a.attrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_type bt on bt.oid = t.typelem
    where n.nspname = 'public'
      and cl.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
    order by cl.relname, a.attnum
  `);

  const byTable = new Map<string, Col[]>();
  for (const col of colRows.rows) {
    if (!byTable.has(col.table)) byTable.set(col.table, []);
    byTable.get(col.table)!.push(col);
  }

  // ── 出力 ──
  const out: string[] = [];
  out.push('// 自動生成。手で編集しないこと。`npm run db:types` で再生成する。');
  out.push('// 生成元: scripts/db-types.ts（pg_catalog を直接読む。Docker 不要）');
  out.push('');
  out.push('export type Json =');
  out.push('  | string | number | boolean | null');
  out.push('  | { [key: string]: Json | undefined }');
  out.push('  | Json[];');
  out.push('');

  for (const e of enumRows.rows) {
    out.push(`export type ${pascal(e.name)} =`);
    out.push(e.labels.map((l) => `  | '${l}'`).join('\n') + ';');
    out.push('');
  }

  out.push('export interface Database {');
  out.push('  public: {');
  out.push('    Tables: {');
  for (const [table, cols] of [...byTable.entries()].sort()) {
    out.push(`      ${table}: {`);
    // Row: DBから読んだ形。not null でなければ null が入りうる。
    out.push('        Row: {');
    for (const col of cols) {
      const t = tsType(col, enumNames);
      out.push(`          ${col.name}: ${t}${col.notNull ? '' : ' | null'};`);
    }
    out.push('        };');
    // Insert: default があるか nullable なら省略可。生成列は指定不可。
    out.push('        Insert: {');
    for (const col of cols) {
      if (col.isGenerated) continue;
      const t = tsType(col, enumNames);
      const optional = col.hasDefault || !col.notNull;
      out.push(`          ${col.name}${optional ? '?' : ''}: ${t}${col.notNull ? '' : ' | null'};`);
    }
    out.push('        };');
    // Update: すべて省略可。
    out.push('        Update: {');
    for (const col of cols) {
      if (col.isGenerated) continue;
      const t = tsType(col, enumNames);
      out.push(`          ${col.name}?: ${t}${col.notNull ? '' : ' | null'};`);
    }
    out.push('        };');
    out.push('      };');
  }
  out.push('    };');
  out.push('    Enums: {');
  for (const e of enumRows.rows) out.push(`      ${e.name}: ${pascal(e.name)};`);
  out.push('    };');
  out.push('  };');
  out.push('}');
  out.push('');
  out.push('export type Tables<T extends keyof Database["public"]["Tables"]> =');
  out.push('  Database["public"]["Tables"][T]["Row"];');
  out.push('export type TablesInsert<T extends keyof Database["public"]["Tables"]> =');
  out.push('  Database["public"]["Tables"][T]["Insert"];');
  out.push('export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =');
  out.push('  Database["public"]["Tables"][T]["Update"];');
  out.push('');

  mkdirSync('src/lib/database', { recursive: true });
  writeFileSync('src/lib/database/types.ts', out.join('\n'));

  await c.end();
  console.log(
    `src/lib/database/types.ts を生成しました（${byTable.size} テーブル / ${enumRows.rows.length} enum）`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
