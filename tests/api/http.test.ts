import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { json, parseJson, traceIdFrom } from '@/lib/api/http';

const request = (body: string, headers?: HeadersInit) => new Request('https://app.test', { method: 'POST', body, headers });
describe('request boundaries', () => {
  it('accepts valid JSON and rejects invalid input', async () => {
    expect(await parseJson(request('{"name":"数学"}'), z.object({ name: z.string() }))).toEqual({ name: '数学' });
    await expect(parseJson(request('broken'), z.unknown())).rejects.toMatchObject({ status: 400 });
    await expect(parseJson(request('{"name":4}'), z.object({ name: z.string() }))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects oversize input even with an absent or dishonest Content-Length', async () => {
    await expect(parseJson(request('{}', { 'content-length': '14000000' }), z.unknown())).rejects.toMatchObject({ status: 413 });
    await expect(parseJson(request(' '.repeat(12 * 1024 * 1024 + 1), { 'content-length': '2' }), z.unknown())).rejects.toMatchObject({ status: 413 });
  });
  it('replaces invalid trace IDs so logging cannot fail on a caller-controlled value', () => {
    const invalid = traceIdFrom(request('{}', { 'x-trace-id': 'not-a-uuid' }));
    expect(z.uuid().safeParse(invalid).success).toBe(true);
    const valid = crypto.randomUUID();
    expect(traceIdFrom(request('{}', { 'x-trace-id': valid }))).toBe(valid);
  });
  it('preserves custom headers and no-store on error responses', () => {
    const response = json({ error: 'test' }, { status: 400, headers: new Headers({ 'x-test': 'yes' }) });
    expect(response.headers.get('x-test')).toBe('yes');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
