import { config } from 'dotenv';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
config({ path: '.env.local', quiet: true });
const run = process.env.DATABASE_URL ? describe : describe.skip;

run('取り消し状態の永続化（検証データは全件ロールバック）', () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let tenant: string, student: string, conversation: string;
  beforeAll(async () => {
    await db.connect(); await db.query('begin');
    tenant = (await db.query("insert into tenants(name,ai_budget_limit_usd) values('取り消し検証',0) returning id")).rows[0].id;
    student = crypto.randomUUID();
    await db.query("insert into auth.users(id,instance_id,aud,role,email) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)", [student, `${student}@example.invalid`]);
    await db.query("insert into users(id,tenant_id,role,display_name) values($1,$2,'student','検証用')", [student, tenant]);
    conversation = (await db.query("insert into conversations(tenant_id,student_id,channel) values($1,$2,'web') returning id", [tenant, student])).rows[0].id;
  });
  afterAll(async () => { await db.query('rollback'); await db.end(); });
  async function append(seq: number, actor: 'agent' | 'student') {
    return (await db.query('insert into messages(tenant_id,conversation_id,seq,actor,content_redacted) values($1,$2,$3,$4,$5) returning id', [tenant, conversation, seq, actor, `発言${seq}`])).rows[0].id;
  }
  async function reject(args: string[], message: string) {
    await db.query('savepoint rejection');
    try { await expect(db.query('select * from undo_last_exchange($1,$2,$3)', args)).rejects.toThrow(message); }
    finally { await db.query('rollback to savepoint rejection'); }
  }
  it('1往復を取り消した状態を保存し、再送するまでは連続取り消しを拒否する', async () => {
    await append(1, 'agent'); const first = await append(2, 'student'); await append(3, 'agent');
    await append(4, 'student'); await append(5, 'agent');
    await db.query('update conversations set message_count=5 where id=$1', [conversation]);
    const result = await db.query('select * from undo_last_exchange($1,$2,$3)', [tenant, student, conversation]);
    expect(result.rows[0]).toMatchObject({ restored_text: '発言4', removed_count: 2 });
    expect((await db.query('select message_count,undo_blocked_message_id from conversations where id=$1', [conversation])).rows[0]).toEqual({ message_count: 3, undo_blocked_message_id: first });
    await reject([tenant, student, conversation], '取り消せる送信がありません');
    await append(4, 'student'); await append(5, 'agent');
    await db.query('update conversations set message_count=5 where id=$1', [conversation]);
    expect((await db.query('select * from undo_last_exchange($1,$2,$3)', [tenant, student, conversation])).rows[0].removed_count).toBe(2);
    await reject([tenant, student, conversation], '取り消せる送信がありません');
  });
  it('所属や生徒の違い・終了済みは取り消せず、一般ユーザーにRPC権限を渡さない', async () => {
    await reject([crypto.randomUUID(), student, conversation], 'conversation is not undoable');
    await reject([tenant, crypto.randomUUID(), conversation], 'conversation is not undoable');
    await db.query("update conversations set state='completed' where id=$1", [conversation]);
    await reject([tenant, student, conversation], 'conversation is not undoable');
    expect((await db.query("select has_function_privilege('authenticated','undo_last_exchange(uuid,uuid,uuid)','execute') as allowed")).rows[0].allowed).toBe(false);
  });
});
