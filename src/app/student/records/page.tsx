import { requireRole } from '@/lib/auth/guard';
import { studentFeedback } from '@/lib/mastery/student-feedback';
import { EmptyState, PageTitle } from '@/components/dashboard';
import { FeedbackCard } from '@/components/student/feedback-card';
export default async function StudentRecordsPage() {
  const context = await requireRole('student');
  const feedback = await studentFeedback(context);
  return <div><PageTitle eyebrow="Records" title="学習の振り返り" description="最後まで取り組んだ説明ワークを、一つずつ振り返ろう。" /><div className="grid gap-5 lg:grid-cols-2">{feedback.map(item => <FeedbackCard key={item.id} feedback={item} />)}</div>{!feedback.length ? <EmptyState>対話が終わり、分析ができると振り返りが表示されます。</EmptyState> : null}</div>;
}
