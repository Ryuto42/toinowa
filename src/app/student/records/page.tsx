import { requireRole } from '@/lib/auth/guard';
import { studentFeedback } from '@/lib/mastery/student-feedback';
import { EmptyState, PageTitle, Panel } from '@/components/dashboard';
import { FeedbackCard } from '@/components/student/feedback-card';

export default async function StudentRecordsPage() {
  const context = await requireRole('student');
  const feedback = await studentFeedback(context);
  const pending = feedback.filter(item => item.review === 'pending').length;
  const revised = feedback.filter(item => item.review === 'revised').length;
  const note = pending ? `${feedback.length}件のうち${pending}件は先生が確認中です。`
    : revised ? `${feedback.length}件のうち${revised}件は先生が見直したものです。`
      : `${feedback.length}件すべて確認ずみです。`;
  return <div>
    <PageTitle title="学習の振り返り" description="説明し終わったテーマごとに、できていたことと次の一歩が出ます。新しいものから並んでいます。" />
    {feedback.length
      ? <Panel description={note}>
          <div className="grid gap-5 lg:grid-cols-2">{feedback.map(item => <FeedbackCard key={item.id} feedback={item} />)}</div>
        </Panel>
      : <EmptyState>対話が終わり、分析ができると振り返りが表示されます。</EmptyState>}
  </div>;
}
