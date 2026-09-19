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
  // format_type() が返す SQL 標準名（関数の引数・戻り型はこちらの形で来る）
  'character varying': 'string',
  'double precision': 'number',
  integer: 'number',
  bigint: 'number',
  smallint: 'number',
  boolean: 'boolean',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  void: 'void',
  record: 'Json',
};

/** format_type() の出力（`public.vector`, `text[]`, `numeric(10,2)` など）を TS 型へ */
function sqlTypeToTs(sql: string): string {
  let s = sql.replace(/^public\./, '').replace(/\(.*\)$/, '').trim();
  let arr = false;
  if (s.endsWith('[]')) {
    arr = true;
    s = s.slice(0, -2);
  }
  const base = TYPE_MAP[s] ?? 'unknown';
  return arr ? `${base}[]` : base;
}

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

  // ── 外部キー ──
  // supabase-js の GenericTable は Relationships を **必須** にしている。
  // これが無いと Tables の型が never に潰れ、insert も select も型が付かない。
  const fkRows = await c.query<{
    table: string;
    name: string;
    columns: string[];
    referencedRelation: string;
    referencedColumns: string[];
    isOneToOne: boolean;
  }>(`
    select
      src.relname as "table",
      con.conname as "name",
      (select array_agg(a.attname::text order by u.ord)
       from unnest(con.conkey) with ordinality u(attnum, ord)
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum
      ) as "columns",
      tgt.relname as "referencedRelation",
      (select array_agg(a.attname::text order by u.ord)
       from unnest(con.confkey) with ordinality u(attnum, ord)
       join pg_attribute a on a.attrelid = con.confrelid and a.attnum = u.attnum
      ) as "referencedColumns",
      exists (
        -- FK列そのものに一意制約があれば 1対1
        select 1 from pg_index i
        where i.indrelid = con.conrelid
          and i.indisunique
          and i.indkey::int2[] @> con.conkey
          and con.conkey @> i.indkey::int2[]
      ) as "isOneToOne"
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = src.relnamespace
    where con.contype = 'f' and n.nspname = 'public'
    order by src.relname, con.conname
  `);

  const fkByTable = new Map<string, typeof fkRows.rows>();
  for (const fk of fkRows.rows) {
    if (!fkByTable.has(fk.table)) fkByTable.set(fk.table, []);
    fkByTable.get(fk.table)!.push(fk);
  }

  // ── 関数（RPC）──
  // supabase-js は Database['public']['Functions'] を要求する。
  // これが無いと .rpc() も .insert() も型が never に潰れる。
  const fnRows = await c.query<{
    name: string;
    argNames: string[] | null;
    argModes: string[] | null;
    argTypes: string[] | null;
    nDefaults: number;
    retType: string;
    retsSet: boolean;
  }>(`
    select
      p.proname as "name",
      p.proargnames as "argNames",
      p.proargmodes::text[] as "argModes",
      (select array_agg(format_type(u.oid, null) order by u.ord)
       from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]))
            with ordinality as u(oid, ord)) as "argTypes",
      p.pronargdefaults as "nDefaults",
      format_type(p.prorettype, null) as "retType",
      p.proretset as "retsSet"
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- 拡張機能（pgvector / citext / pgcrypto）が public に作った関数を除外する。
      -- これを入れないと pgvector のオーバーロードで同名キーが大量に重複する。
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
      and p.proname <> 'custom_access_token_hook'
    order by p.proname
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
    // Relationships（外部キー）。supabase-js の型制約を満たすために必須。
    const fks = fkByTable.get(table) ?? [];
    if (fks.length === 0) {
      out.push('        Relationships: [];');
    } else {
      out.push('        Relationships: [');
      for (const fk of fks) {
        out.push('          {');
        out.push(`            foreignKeyName: '${fk.name}';`);
        out.push(`            columns: [${fk.columns.map((x) => `'${x}'`).join(', ')}];`);
        if (fk.isOneToOne) out.push('            isOneToOne: true;');
        else out.push('            isOneToOne: false;');
        out.push(`            referencedRelation: '${fk.referencedRelation}';`);
        out.push(
          `            referencedColumns: [${fk.referencedColumns.map((x) => `'${x}'`).join(', ')}];`,
        );
        out.push('          },');
      }
      out.push('        ];');
    }
    out.push('      };');
  }
  out.push('    };');
  out.push('    Views: {');
  out.push('      [_ in never]: never;');
  out.push('    };');
  out.push('    Functions: {');
  const seenFn = new Set<string>();
  for (const f of fnRows.rows) {
    // TypeScript のオブジェクト型は同名キーを持てない。
    // オーバーロードがあれば最初の1つだけを出す。
    if (seenFn.has(f.name)) continue;
    seenFn.add(f.name);
    // proargmodes が null なら全部 IN。あれば 'i'(in) と 'b'(inout) だけ残す。
    const modes = f.argModes;
    const allNames = f.argNames ?? [];
    const allTypes = f.argTypes ?? [];
    const keep = allNames.map((_, i) => !modes || modes[i] === 'i' || modes[i] === 'b');
    const names = allNames.filter((_, i) => keep[i]);
    const types = allTypes.filter((_, i) => keep[i]);
    const required = names.length - (f.nDefaults ?? 0);
    out.push(`      ${f.name}: {`);
    if (names.length === 0) {
      out.push('        Args: Record<PropertyKey, never>;');
    } else {
      out.push('        Args: {');
      names.forEach((n, i) => {
        out.push(
          `          ${n}${i < required ? '' : '?'}: ${sqlTypeToTs(types[i] ?? 'text')};`,
        );
      });
      out.push('        };');
    }
    const ret = sqlTypeToTs(f.retType);
    out.push(`        Returns: ${f.retsSet ? `${ret}[]` : ret};`);
    out.push('      };');
  }
  out.push('    };');
  out.push('    CompositeTypes: {');
  out.push('      [_ in never]: never;');
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
