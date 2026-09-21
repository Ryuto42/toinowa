import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { ForbiddenError } from '@/lib/auth/errors';
import type { Json } from '@/lib/database/types';
import { ApiInputError, json, parseJson, routeError, traceIdFrom, uuidParam } from '@/lib/api/http';
import { preCheck } from '@/lib/security/guard';
import { recordAudit } from '@/lib/security/audit';

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  difficulty: z.number().int().min(1).max(5),
  content: z.string().trim().max(20000).default(''),
  dueAt: z.iso.datetime().nullable().optional(),
  /** 下書き（AIが提案したお題）を公開に切り替える。 */
  publish: z.boolean().optional(),
});

/**
 * 公開済みの説明ワークを編集する。
 *
 * 1つの「お題」は lessons / concepts / questions / assignments の4行に分かれて
 * 保存されているため、画面の1フィールドが複数テーブルに跨る:
 *   タイトル → lessons.title, concepts.name
 *   お題の文面 → questions.body
 *   難易度 → questions.difficulty
 *   授業内容 → concepts.description, questions.grading_rubric.reference
 *   期限 → assignments.due_at
 *
 * 権限は create_explanation_work と同じ条件で確認する
 * （管理者、または対象クラスを担当している先生）。
 */
export async function PATCH(request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const assignmentId = uuidParam((await route.params).id, 'assignmentId');
    const input = await parseJson(request, schema);
    const db = adminDb();

    const assignment = await db.from('assignments')
      .select('id,lesson_id,classroom_id,question_ids,status')
      .eq('tenant_id', context.tenantId).eq('id', assignmentId).maybeSingle();
    if (assignment.error) throw new Error(assignment.error.message);
    if (!assignment.data) return json({ error: 'not_found' }, { status: 404 });

    // 担当クラス以外のお題は編集させない
    if (context.role !== 'admin') {
      const enrollment = await db.from('enrollments').select('id')
        .eq('tenant_id', context.tenantId).eq('user_id', context.userId)
        .eq('classroom_id', assignment.data.classroom_id ?? '')
        .eq('role', 'teacher').eq('active', true).maybeSingle();
      if (enrollment.error) throw new Error(enrollment.error.message);
      if (!enrollment.data) throw new ForbiddenError();
    }

    const questionId = assignment.data.question_ids[0];
    if (!questionId) throw new ApiInputError('編集できるお題が見つかりません');
    if (input.dueAt && new Date(input.dueAt).getTime() <= Date.now()) {
      throw new ApiInputError('今より後の期限を設定してください');
    }
    // 期限のない課題は生徒の画面で締切が空欄になり、停滞検知も効かない。
    if (input.publish && !input.dueAt) throw new ApiInputError('公開するには期限を設定してください');

    // 入力は保存前に必ずマスク・検査を通す（作成時と同じ経路）
    const title = preCheck(input.title).masked.text;
    const body = preCheck(input.body).masked.text;
    const content = input.content ? preCheck(input.content).masked.text : '';

    const question = await db.from('questions')
      .select('id,concept_id,grading_rubric')
      .eq('tenant_id', context.tenantId).eq('id', questionId).maybeSingle();
    if (question.error) throw new Error(question.error.message);
    if (!question.data) return json({ error: 'not_found' }, { status: 404 });

    const rubric = question.data.grading_rubric && typeof question.data.grading_rubric === 'object'
      && !Array.isArray(question.data.grading_rubric)
      ? { ...(question.data.grading_rubric as Record<string, unknown>) }
      : {};
    rubric.reference = content;

    const updates = await Promise.all([
      db.from('lessons').update({
        title, objectives: [title] as unknown as Json,
        ...(input.publish ? { status: 'published' as const } : {}),
      })
        .eq('tenant_id', context.tenantId).eq('id', assignment.data.lesson_id),
      db.from('concepts').update({ name: title, description: content })
        .eq('tenant_id', context.tenantId).eq('id', question.data.concept_id),
      db.from('questions').update({ body, difficulty: input.difficulty, grading_rubric: rubric as Json })
        .eq('tenant_id', context.tenantId).eq('id', questionId),
      db.from('assignments').update({
        due_at: input.dueAt ?? null,
        ...(input.publish ? { status: 'published' as const, published_at: new Date().toISOString(), approved_by: context.userId } : {}),
      }).eq('tenant_id', context.tenantId).eq('id', assignmentId),
    ]);
    for (const result of updates) if (result.error) throw new Error(result.error.message);

    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: context.role,
      action: 'topic.update', resourceType: 'assignment', resourceId: assignmentId,
      result: 'allow', traceId: traceIdFrom(request),
      detail: { difficulty: input.difficulty, published: input.publish ?? false },
    });
    return json({ assignmentId, status: input.publish ? 'published' : assignment.data.status });
  } catch (error) {
    return routeError(error);
  }
}
