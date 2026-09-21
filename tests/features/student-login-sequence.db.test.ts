import { config } from 'dotenv';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
config({ path: '.env.local', quiet: true });
const run = process.env.DATABASE_URL ? describe : describe.skip;
run('生徒ログインIDの自動採番（専用データ・AI呼び出しなし）', () => {
  const options = { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  const db = new Client(options);
  const pool = new Pool({ ...options, max: 6 });
  const tenants: string[] = [], users: string[] = [];
  async function authUser() {
    const id = crypto.randomUUID();
    await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [id, `${id}@example.invalid`]);
    users.push(id);
    return id;
  }
  async function insert(id: string, tenant: string, identifier: string | null = null, role = 'student') {
    return (await pool.query('insert into public.users(id,tenant_id,role,display_name,login_identifier) values($1,$2,$3,$4,$5) returning login_identifier', [id, tenant, role, '採番検証', identifier])).rows[0].login_identifier;
  }
  beforeAll(async () => {
    await db.connect();
    for (let i = 0; i < 2; i++) tenants.push((await db.query("insert into tenants(name,ai_budget_limit_usd) values('採番検証',0) returning id")).rows[0].id);
  });
  afterAll(async () => {
    await pool.end();
    for (const id of users) await db.query('delete from auth.users where id=$1', [id]);
    for (const id of tenants) await db.query('delete from tenants where id=$1', [id]);
    await db.end();
  });
  it('IDなしの登録で所属ごとにstudent1から始め、先生には発行しない', async () => {
    expect(await insert(await authUser(), tenants[0])).toBe('student1');
    expect(await insert(await authUser(), tenants[0])).toBe('student2');
    expect(await insert(await authUser(), tenants[1])).toBe('student1');
    expect(await insert(await authUser(), tenants[0], null, 'teacher')).toBeNull();
  });
  it('6件を同時に登録しても重複しない', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await authUser());
    const assigned = await Promise.all(ids.map(id => insert(id, tenants[0])));
    expect([...assigned].sort()).toEqual(['student3', 'student4', 'student5', 'student6', 'student7', 'student8']);
  });
  it('既存・編集したIDの番号を超えて発行し、削除・変更で番号を戻さない', async () => {
    const edited = await authUser();
    expect(await insert(edited, tenants[0], 'StUdEnT020')).toBe('StUdEnT020');
    const deleted = await authUser();
    expect(await insert(deleted, tenants[0])).toBe('student21');
    await db.query('delete from auth.users where id=$1', [deleted]);
    expect(await insert(await authUser(), tenants[0])).toBe('student22');
    await db.query("update users set login_identifier='student30' where id=$1", [edited]);
    await db.query("update users set login_identifier='custom-name' where id=$1", [edited]);
    expect(await insert(await authUser(), tenants[0])).toBe('student31');
    expect((await db.query('select login_identifier from users where id=$1', [edited])).rows[0].login_identifier).toBe('custom-name');
  });
});
