/**
 * 現行examの要求生成・検証関数を使う、架空の画像攻撃試験。
 * 既定は通信なし。--live --max-cost-usd <今回の管理上限> でのみ実APIを呼ぶ。
 * 本体のDB、ジョブ、認証、ブラウザでの画像変換までは試験しない。
 * 結果はGit対象外のbenchmark-data/injection/へ保存する。
 */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { documentImagesSchema, hasImageSignature } from '../src/lib/materials/images';
import { evaluateImageProbe, IMAGE_PROBES, imageProbeRequest, summarizeImageProbes, type ImageProbe, type ProbeResult } from './benchmarks/exam-injection-protocol';

config({ path: '.env.local', quiet: true });

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }), finish_reason: z.string().nullable().optional() })).optional(),
  usage: z.object({ cost_usd: z.number().nonnegative().finite().optional() }).optional(),
}).passthrough();

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  if (live && args.includes('--dry-run')) throw new Error('--liveと--dry-runは併用できません');
  const budgetAt = args.indexOf('--max-cost-usd');
  const limit = budgetAt < 0 ? NaN : Number(args[budgetAt + 1]);
  const acceptedArgs = new Set(['--live', '--dry-run', '--max-cost-usd']);
  for (let at = 0; at < args.length; at++) {
    if (at === budgetAt + 1 && budgetAt >= 0) continue;
    if (!acceptedArgs.has(args[at])) throw new Error('未対応の引数です');
  }
  if (live && (!Number.isFinite(limit) || limit <= 0)) throw new Error('実行には--max-cost-usdで今回の管理上限を指定してください');
  const key = process.env.ORCAROUTER_API_KEY;
  if (live && !key) throw new Error('ORCAROUTER_API_KEYが未設定です');
  const base = process.env.ORCAROUTER_BASE_URL ?? 'https://api.orcarouter.ai/v1';
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const cases = IMAGE_PROBES.map(probe => {
    const bytes = readFileSync(join(import.meta.dirname, 'fixtures/injection-images', probe.file));
    const image = `data:image/png;base64,${bytes.toString('base64')}`;
    documentImagesSchema.parse({ purpose: 'exam', images: [image] });
    if (!hasImageSignature(image)) throw new Error('試験画像の形式が不正です');
    const request = imageProbeRequest(image, { AI_EXAM_MODEL: process.env.AI_EXAM_MODEL });
    return { probe, request, imageSha256: hash(bytes), requestSha256: hash(JSON.stringify(request)) };
  });
  const runDir = join(process.cwd(), 'benchmark-data/injection', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(runDir, { recursive: true });
  const reserve = 0.25;
  let managementCost = 0, knownCost = 0, unknownCostCalls = 0;
  const results: Array<{ file: string; kind: ImageProbe['kind']; result: ProbeResult; costUsd: number | null; elapsedMs: number; resolvedModel: string | null }> = [];
  const report = () => ({
    version: 2, recordedAt: new Date().toISOString(), mode: live ? 'live' : 'dry-run',
    request: { model: cases[0].request.model, modelClass: 'exam', maxTokens: cases[0].request.max_tokens, timeoutMs: 60000,
      promptSha256: hash(JSON.stringify(cases[0].request.messages[0])), schemaSha256: hash(JSON.stringify(cases[0].request.response_format)) },
    fixtures: cases.map(({ probe, imageSha256, requestSha256 }) => ({ ...probe, imageSha256, requestSha256 })),
    scope: 'Shared exam prompt/schema/model class/max tokens and validation functions. Direct PNG fixtures; no browser preprocessing, DB writes, jobs, tenant budget, or UI. 15 numeric fields per input, not whole-document correctness or a general defense rate.',
    budget: { limitUsd: live ? limit : null, reservePerUnknownCallUsd: reserve, managementCostUsd: managementCost, knownCostUsd: knownCost, unknownCostCalls,
      note: 'Reserve is an estimate, not an upstream billing guarantee. Separate from the existing exam benchmark ledger; check cumulative account spending before live use.' },
    results, summary: live ? summarizeImageProbes(results) : null,
  });
  const save = () => writeFileSync(join(runDir, 'report.json'), JSON.stringify(report(), null, 2) + '\n');
  save();
  if (!live) {
    console.log(`DRY RUN: ${cases.length}枚の要求を検証しました。API呼び出し0回。\n${runDir}/report.json`);
    return;
  }
  for (const { probe, request } of cases) {
    // 通信失敗も無料にしない。正常対照が使えなければ後続の課金を止める。
    if (managementCost + reserve > limit) break;
    const started = performance.now();
    let content = '', finishReason: string | null | undefined, errorCode: string | undefined;
    let costUsd: number | null = null, resolvedModel: string | null = null;
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'X-OrcaRouter-Include-Cost': 'true' },
        body: JSON.stringify(request),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ error: z.object({ code: z.string().optional() }).optional(), code: z.string().optional() }).safeParse(body);
        const code = error.success ? error.data.error?.code ?? error.data.code : undefined;
        errorCode = code === 'guardrail_blocked' ? code : `http_${response.status}`;
      } else {
        const parsed = responseSchema.parse(body);
        content = parsed.choices?.[0]?.message.content ?? '';
        finishReason = parsed.choices?.[0]?.finish_reason;
        costUsd = parsed.usage?.cost_usd ?? null;
        resolvedModel = response.headers.get('x-orca-resolved-model') ?? parsed.model ?? null;
      }
    } catch { errorCode = 'transport_or_response_error'; }
    const result = evaluateImageProbe({ content, finishReason, errorCode });
    knownCost += costUsd ?? 0;
    managementCost += costUsd ?? reserve;
    if (costUsd === null) unknownCostCalls++;
    results.push({ ...probe, result, costUsd, resolvedModel, elapsedMs: Math.round(performance.now() - started) });
    writeFileSync(join(runDir, `${probe.file}.response.json`), JSON.stringify({ content: key ? content.split(key).join('[redacted]') : content, finishReason, errorCode }, null, 2) + '\n');
    save();
    console.log(`${probe.file}: ${result.status} (${result.correctFields ?? 0}/${result.totalFields ?? 15}項目)`);
    if (probe.kind === 'control' && result.status !== 'extracted') break;
  }
  const summary = summarizeImageProbes(results);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`${runDir}/report.json\n取得・遮断・改変・判定不能は別集計です。攻撃一般への防御率ではありません。`);
  if (!summary.accepted) process.exitCode = 1;
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : '試験を実行できませんでした');
  process.exitCode = 1;
});
