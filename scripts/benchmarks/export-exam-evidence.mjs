// Publish aggregate facts only. No API calls, images, student text or account keys.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sources = {
  baseline: 'benchmark-data/exams/runs/aggregate.json',
  latest: 'benchmark-data/exams/runs-evidence-v3/scores.json',
  protocol: 'benchmark-data/exams/runs-evidence-v3/protocol.json',
  ledger: 'benchmark-data/exams/runs/ledger.json',
};
const data = {}, hashes = {};
for (const [key, path] of Object.entries(sources)) {
  const raw = await readFile(path);
  data[key] = JSON.parse(raw.toString());
  hashes[key] = { path, sha256: createHash('sha256').update(raw).digest('hex') };
}
const round = number => Math.round(number * 1_000_000) / 1_000_000;
const summary = {
  version: 1,
  measuredDate: '2026-09-21',
  sources: hashes,
  scope: {
    baseline: 'Two real exams, three paper pages, each under three acquisition conditions. Nine inputs per model and 450 selected numeric fields per model. Not nine independent exams.',
    latest: data.protocol.scope,
    supplemental: 'C_scan was tested with Flash only; it is not part of the Flash/Pro paired comparison.',
    validation: 'Verifier rules were refined offline using these same outputs. This is not held-out evaluation. Numeric agreement does not verify all source headings or educational effectiveness.',
  },
  baseline: Object.entries(data.baseline).map(([model, row]) => ({
    model, inputs: row.n, correct: row.correct, total: row.total,
    wrong: row.wrong, missing: row.missing, ambiguous: row.ambiguous, unusable: row.unusable,
    knownCostUsd: row.costUsd, meanElapsedMs: row.meanMs,
  })),
  latest: data.latest.scored.map(row => ({
    case: row.case, model: row.model, supplemental: row.supplemental,
    correct: row.correct, total: row.total, wrong: row.wrong,
    missing: row.missing, ambiguous: row.ambiguous, unusable: row.unusable,
    valid: row.valid, reviewRequired: row.reviewRequired,
    acceptedCorrect: row.acceptedCorrect, acceptedWrong: row.acceptedWrong,
    elapsedMs: row.elapsedMs, knownCostUsd: row.costUsd,
  })),
  budget: {
    callsAcrossAllProtocols: data.ledger.calls,
    knownCostUsd: round(data.ledger.observed),
    unknownCostCalls: data.ledger.unknown,
    reservedPerUnknownCallUsd: 0.25,
    managementAmountUsd: round(data.ledger.committed),
    limitUsd: data.ledger.ceiling,
    note: 'Management amount includes reserves; it is not the final billed amount. Other team experiments and application usage are separate.',
  },
};
await writeFile('docs/data/exam-benchmark-summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log('Exported aggregate evidence; no model calls.');
