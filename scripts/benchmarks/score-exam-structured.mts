// Offline evaluation against the frozen, user-approved reference. Never calls an API.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateExamExtraction, inspectExamRows, summarizeExamExtraction, type ExamRow } from './structured-extraction';
import { preCheck, postCheck } from '../../src/lib/security/guard';

const root = 'benchmark-data/exams';
const dir = `${root}/runs-structured-v2`;
const recovery = process.argv.includes('--recovery');
const retryResponses = recovery ? await Promise.all((await readdir(`${dir}/responses-retry`)).filter(f => f.endsWith('.json')).map(async f => JSON.parse(await readFile(`${dir}/responses-retry/${f}`, 'utf8')))) : [];
const ref = JSON.parse(await readFile(`${root}/reference.json`, 'utf8'));
assert.equal(ref.status, 'user_verified');
type Target = { section: string; label: string; question?: string; unit?: string; names: string[]; fields: string[]; values: (number | null)[] };
const normalize = (s: string) => s.normalize('NFKC').replace(/[\s・、,（）()－−-]/g, '');
const aliases: Record<string, string[]> = {
  '数学①（数学IA）': ['数学①', '数学IA', '数学①数学IA'],
  '数学②（数学IIB）': ['数学②', '数学IIB', '数学②数学IIB'],
  '総合1（5－7理系）': ['総合1', '総合15-7理系'],
  '総合2（理系）': ['総合2', '総合2理系'],
  '5－7理系型': ['5-7理系'],
};
const table = (rows: (string | number | null)[][], section: string, fields: string[]): Target[] => rows.map(r => ({
  section, label: String(r[0]), names: [String(r[0]), ...(aliases[String(r[0])] ?? [])].map(normalize), fields, values: r.slice(1) as (number | null)[],
}));
const targets: Record<string, Target[]> = {
  A: [...table(ref.A.raw, 'raw', ['score', 'maxScore', 'nationalDeviation']), ...table(ref.A.converted, 'converted', ['score', 'maxScore'])],
  B: table(ref.B.raw, 'raw', ['score', 'maxScore', 'nationalDeviation']),
  C: ref.C.items.map((r: (string | number)[]) => ({ section: 'unit', label: `${r[0]}/${r[1]}/${r[2]}`, names: [normalize(String(r[0]))], question: String(r[1]), unit: normalize(String(r[2])), fields: ['score', 'maxScore', 'nationalMeanPoints'], values: r.slice(3, 6) })),
};
function matches(t: Target, r: ExamRow) {
  if (t.section === 'unit') return r.section === 'unit' && t.names.includes(normalize(r.subject)) && normalize(r.question ?? '') === t.question &&
    !!r.unit && (normalize(r.unit).startsWith(t.unit!) || t.unit!.startsWith(normalize(r.unit))) && normalize(r.unit).length >= 2;
  if (t.section === 'converted' ? r.section !== 'converted' : !['subject', 'aggregate'].includes(r.section)) return false;
  // Some outputs split a printed multi-line subject between subject and unit.
  return [r.subject, r.unit ?? '', r.subject + (r.unit ?? '')].some(name => t.names.includes(normalize(name)));
}
const responses = await Promise.all((await readdir(`${dir}/responses`)).filter(f => f.endsWith('.json')).map(async f => JSON.parse(await readFile(`${dir}/responses/${f}`, 'utf8'))));
const fieldRows: Record<string, unknown>[] = [];
const scored: Record<string, unknown>[] = [];
const excluded: string[] = [];
for (const id of ['A_scan', 'A_clear', 'A_shadow', 'B_scan', 'B_clear', 'B_shadow', 'C_scan', 'C_clear', 'C_shadow']) {
  const request = JSON.parse(await readFile(`${root}/requests-structured-v2/${id}.json`, 'utf8'));
  const hash = createHash('sha256').update(JSON.stringify(request.body)).digest('hex');
  const trials = responses.filter(r => r.case === id && r.requestSha256 === hash).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  excluded.push(...responses.filter(r => r.case === id && r.requestSha256 !== hash).map(r => r.id));
  assert(trials.length <= 2, `Unexpected repeat: ${id}`);
  for (const [index, original] of trials.entries()) {
    let r = original;
    if (recovery && index === 1 && original.status === 'error') {
      const retries = retryResponses.filter(item => item.case === id && item.requestSha256 === hash);
      assert(retries.length <= 1, 'Only one transport-failure retry is allowed');
      if (retries[0]) r = retries[0];
    }
    // Replay swaps the outgoing model downstream of the worker. On timeout there is
    // no resolvedModel; the comparison manifest is the authoritative requested model.
    const model = index === 0 ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
    if (index === 1) {
      const compare = JSON.parse(await readFile(`${dir}/${id}-compare.json`, 'utf8'));
      assert.equal(compare[0].model, 'google/gemini-2.5-flash');
    }
    if (r.resolvedModel) assert.equal(r.resolvedModel, model);
    let rows: ExamRow[] = [], accepted: ExamRow[] = [], valid = false, validationError: string | undefined, summary;
    try {
      assert.equal(r.status, 'response');
      const parsed = validateExamExtraction(JSON.parse(r.data.choices[0].message.content));
      postCheck(JSON.stringify(parsed)); preCheck(JSON.stringify(parsed));
      rows = parsed.rows; valid = true;
      accepted = inspectExamRows([parsed]).accepted;
      try { summary = summarizeExamExtraction([parsed]); } catch { /* no usable rows */ }
    } catch (e) { validationError = String(e); }
    const count = { correct: 0, wrong: 0, missing: 0, ambiguous: 0, unusable: 0, acceptedCorrect: 0, acceptedWrong: 0, blankFabrications: 0 };
    for (const target of targets[id[0]]) {
      const found = rows.filter(row => matches(target, row));
      const checked = accepted.filter(row => matches(target, row));
      for (const [i, expected] of target.values.entries()) {
        const field = target.fields[i] as keyof ExamRow;
        // A repeated chart/table cell with the same value isn't an ambiguity.
        // Conflicting non-null values are ambiguous; never pick the expected one.
        const values = [...new Set(found.map(row => row[field]).filter(value => value !== null))];
        const actual = values.length === 1 ? values[0] : null;
        if (expected === null) { if (typeof actual === 'number') count.blankFabrications++; continue; }
        const status = !valid ? 'unusable' : values.length > 1 ? 'ambiguous' : actual === null ? 'missing' : actual === expected ? 'correct' : 'wrong';
        count[status]++;
        const acceptedActual = checked.length === 1 ? checked[0][field] : null;
        if (acceptedActual === expected) count.acceptedCorrect++;
        else if (typeof acceptedActual === 'number') count.acceptedWrong++;
        fieldRows.push({ responseId: r.id, case: id, model, row: target.label, field, expected, actual, status, acceptedActual });
      }
    }
    const total = count.correct + count.wrong + count.missing + count.ambiguous + count.unusable;
    scored.push({ id: r.id, firstAttemptId: original.id, retried: r !== original, case: id, model, ...count, total, allTargetFieldsMatch: count.correct === total, schemaAndGuardsPass: valid, validationError, rowCount: rows.length, acceptedRows: accepted.length, elapsedMs: r.elapsedMs + (r !== original ? original.elapsedMs : 0), costUsd: r.costUsd, priorUnknownCost: r !== original && original.costUsd === null, summary });
  }
}
const csv = (rows: Record<string, unknown>[]) => { const keys = Object.keys(rows[0] ?? {}); return keys.join(',') + '\n' + rows.map(r => keys.map(k => '"' + String(r[k] ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n'; };
const prefix = recovery ? 'recovery-' : '';
await writeFile(`${dir}/${prefix}scores.json`, JSON.stringify({ method: 'Frozen numeric targets; semantic subject aliases, exact question identity and compatible unit label. Equal repeated cells count once; conflicting values are ambiguous. Model failures counted as unusable. Local row acceptance reported separately from raw extraction. Failed preparation schemas excluded from accuracy but retained in cost ledger. Recovery is a separate secondary analysis: at most one unchanged retry of a transport failure, never of a wrong answer; elapsedMs sums API waits and excludes the gap before retry.', excludedPreparation: excluded, scored }, null, 2));
await writeFile(`${dir}/${prefix}field-scores.csv`, csv(fieldRows));
const aggregate = Object.fromEntries([...new Set(scored.map(r => String(r.model)))].map(model => {
  const rs = scored.filter(r => r.model === model);
  const sum = (key: string) => rs.reduce((total, r) => total + Number(r[key] ?? 0), 0);
  const times = rs.map(r => Number(r.elapsedMs)).sort((a, b) => a - b);
  return [model, {
    ...Object.fromEntries(['correct', 'wrong', 'missing', 'ambiguous', 'unusable', 'total', 'acceptedCorrect', 'acceptedWrong', 'blankFabrications'].map(key => [key, sum(key)])),
    count: rs.length, allMatch: sum('allTargetFieldsMatch'), valid: sum('schemaAndGuardsPass'),
    meanMs: sum('elapsedMs') / rs.length, medianMs: (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2,
    knownCost: sum('costUsd'), unknownCost: rs.filter(r => r.costUsd === null || r.priorUnknownCost).length,
    within15s: times.filter(t => t <= 15000).length, retryCalls: sum('retried'),
  }];
}));
await writeFile(`${dir}/${prefix}aggregate.json`, JSON.stringify(aggregate, null, 2));
console.table(scored.map(r => ({ case: r.case, model: r.model, correct: r.correct, total: r.total, acceptedCorrect: r.acceptedCorrect, acceptedWrong: r.acceptedWrong, ms: r.elapsedMs, cost: r.costUsd, retried: r.retried })));
