import 'server-only';
import { z } from 'zod';
import { registerJobHandler } from './registry';
import { adminDb } from '@/lib/database/admin';
import { callModel } from '@/lib/orcarouter/call';
import { applyExamAnalysis } from '@/lib/materials/apply-exam-analysis';
import { examPageSchema, examPageMessages, validateExamPage, buildExamProposal, EXAM_EXTRACTION_MAX_TOKENS } from '@/lib/materials/exam-extraction';
import { isRetryable, SafetyBlocked, BudgetExceeded } from '@/lib/orcarouter/errors';
import { preCheck, postCheck } from '@/lib/security/guard';
import type { Json } from '@/lib/database/types';

const checkpointSchema = z.object({ protocol: z.literal('exam-v3'), pages: z.array(examPageSchema).max(8), pageRetries: z.number().int().min(0).max(1) });
registerJobHandler('analyze_exam', async job => {
  const id = (job.payload as { analysisId: string }).analysisId;
  const db = adminDb();
  const found = await db.from('exam_analyses').select('*').eq('id', id).eq('tenant_id', job.tenant_id).single();
  if (found.error) throw new Error(found.error.message);
  const item = found.data;
  if (item.status === 'failed' || item.status === 'review_required') return { nextStep: null, state: {} };
  if (item.status === 'completed') {
    await applyExamAnalysis(job.tenant_id, id);
    return { nextStep: null, state: {} };
  }
  const checkpoint = checkpointSchema.parse(job.state && typeof job.state === 'object' && 'protocol' in job.state
    ? job.state : { protocol: 'exam-v3', pages: [], pageRetries: 0 });
  const images = z.array(z.string()).min(1).max(8).parse(item.images);
  if (checkpoint.pages.length < images.length) {
    const started = await db.from('exam_analyses').update({ status: 'processing' }).eq('id', id).eq('tenant_id', job.tenant_id);
    if (started.error) throw new Error(started.error.message);
    try {
      const result = await callModel({ router: 'curriculum', modelClass: 'exam', agentName: 'lesson-analysis', requestType: 'extract_exam', schema: examPageSchema, maxOutputTokens: EXAM_EXTRACTION_MAX_TOKENS,
        trace: { tenantId: job.tenant_id, userId: item.created_by, studentId: item.student_id, traceId: job.trace_id },
        messages: examPageMessages(images[checkpoint.pages.length]),
        validateOutput: output => { validateExamPage(output); postCheck(JSON.stringify(output)); preCheck(JSON.stringify(output)); },
      });
      const page = validateExamPage(JSON.parse(preCheck(JSON.stringify(result.data)).masked.text));
      // Save every successful page before finalization. A DB/application retry never
      // needs to pay for earlier pages again once this checkpoint has been committed.
      return { nextStep: 'extract_or_finalize_exam', state: { protocol: 'exam-v3', pages: [...checkpoint.pages, page], pageRetries: 0 } as Json };
    } catch (error) {
      if (!(error instanceof SafetyBlocked) && !(error instanceof BudgetExceeded) && !(error instanceof z.ZodError) && isRetryable(error) && checkpoint.pageRetries < 1) {
        return { nextStep: 'retry_exam_page', state: { ...checkpoint, pageRetries: 1 } as Json, runAfter: new Date(Date.now() + 2000).toISOString() };
      }
      const failed = await db.from('exam_analyses').update({ status: 'failed', images: null, error_message: '分析を完了できませんでした。必要な場合は同じページを1回再試行しました。資料・利用上限を確認して再アップロードするか、手入力してください。', completed_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', job.tenant_id);
      if (failed.error) throw new Error(failed.error.message);
      return { nextStep: null, state: {} };
    }
  }
  let result: Json;
  let reviewRequired: boolean;
  try {
    const prepared = buildExamProposal(checkpoint.pages);
    reviewRequired = prepared.reviewRequired;
    const candidate = { ...prepared.proposal, reviewRequired, reviewReasons: prepared.reviewReasons, excludedHeadings: prepared.excludedHeadings,
      extraction: { version: 3, pages: checkpoint.pages }, originalProposal: prepared.proposal };
    postCheck(JSON.stringify(candidate));
    result = JSON.parse(preCheck(JSON.stringify(candidate)).masked.text) as Json;
  } catch {
    const failed = await db.from('exam_analyses').update({ status: 'failed', images: null, error_message: '読み取り結果を安全に整理できませんでした。ページを分けて再アップロードするか、手入力してください。', completed_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', job.tenant_id);
    if (failed.error) throw new Error(failed.error.message);
    return { nextStep: null, state: {} };
  }
  const saved = await db.from('exam_analyses').update({ status: reviewRequired ? 'review_required' : 'completed',
    images: reviewRequired ? item.images : null, result,
    error_message: null, completed_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', job.tenant_id);
  if (saved.error) throw new Error(saved.error.message);
  if (!reviewRequired) await applyExamAnalysis(job.tenant_id, id);
  return { nextStep: null, state: {} };
});
