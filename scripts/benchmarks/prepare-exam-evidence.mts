import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { examPageSchema, examPageMessages, EXAM_EXTRACTION_MAX_TOKENS } from '../../src/lib/materials/exam-extraction';
const root = 'benchmark-data/exams';
await mkdir(`${root}/runs-evidence-v3`, { recursive: true });
let existing = false;
try { await access(`${root}/runs-evidence-v3/protocol.json`); existing = true; } catch {}
if (existing) throw Error('Preserve measured protocol; use a new version to change it');
await mkdir(`${root}/requests-evidence-v3`, { recursive: true });
await mkdir(`${root}/work-evidence-v3`, { recursive: true });
const hashes: Record<string, string> = {};
for (const id of ['A_scan', 'B_scan']) {
  const images = JSON.parse(await readFile(`${root}/normalized/${id}.json`, 'utf8'));
  if (images.length !== 1) throw Error('Expected single page');
  const body = { model: 'google/gemini-2.5-flash', messages: examPageMessages(images[0]), max_tokens: EXAM_EXTRACTION_MAX_TOKENS,
    response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: z.toJSONSchema(examPageSchema, { io: 'output' }) } } };
  hashes[id] = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  await writeFile(`${root}/requests-evidence-v3/${id}.json`, JSON.stringify({ case: id, body }));
}
const source = await readFile('src/lib/materials/exam-extraction.ts', 'utf8');
await writeFile(`${root}/runs-evidence-v3/extraction-source.ts`, source);
await writeFile(`${root}/runs-evidence-v3/protocol.json`, JSON.stringify({ version: 'evidence-v3', createdAt: new Date().toISOString(),
  cases: ['A_scan', 'B_scan'], models: ['google/gemini-2.5-flash', 'google/gemini-2.5-pro'], hashes,
  sourceSha256: createHash('sha256').update(source).digest('hex'), timeoutMs: 60000, maxTokens: EXAM_EXTRACTION_MAX_TOKENS,
  scope: 'Targeted in-sample diagnostic comparison, 87 frozen numeric fields per model. Not a replacement for the nine-input benchmark. Same table-evidence prompt/schema/normalized image; one call per model per page, no quality retries. Compare missing/incorrect values, automatic-application gate and source-table attribution. Retain failures. Shared $2 ledger reserves $0.25 before each sequential call.' }, null, 2));
console.log('Prepared two evidence-v3 pairs without API calls.');
