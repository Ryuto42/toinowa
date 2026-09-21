import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { PageTitle } from '@/components/dashboard';
import { ExamReview } from '@/components/admin/exam-review';
import { examAnalysisResultSchema } from '@/lib/materials/exam-analysis';
import { z } from 'zod';
export default async function ExamReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRole('admin');
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { data, error } = await adminDb().from('exam_analyses').select('id,status,result,images').eq('id', id.data).eq('tenant_id', context.tenantId).eq('created_by', context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const result = examAnalysisResultSchema.safeParse(data.result);
  const extra = (data.result ?? {}) as { reviewReasons?: string[]; reviewedBy?: string };
  return <div><PageTitle title="模試の読み取り結果を確認" description="確認が必要な結果は、承認するまで生徒の情報・学習計画に反映しません。" />
    {result.success && (data.status === 'review_required' || (data.status === 'completed' && extra.reviewedBy === context.userId))
      ? <ExamReview id={data.id} initial={result.data} reasons={extra.reviewReasons ?? []} images={Array.isArray(data.images) ? data.images.filter((s): s is string => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s)) : []} completed={data.status === 'completed'} />
      : <p>現在は確認待ちの結果がありません。ユーザー管理の分析状況をご確認ください。</p>}
  </div>;
}
