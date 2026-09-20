import { requireRole } from '@/lib/auth/guard';
import { getConversation } from '@/lib/conversation/service';
import { studentFeedback } from '@/lib/mastery/student-feedback';
import { json, routeError, uuidParam } from '@/lib/api/http';

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireRole('student');
    const id = uuidParam((await route.params).id);
    const conversation = await getConversation(context, id);
    if (conversation.state !== 'completed') return json({ status: 'in_progress', feedback: null });
    const [feedback] = await studentFeedback(context, id);
    return json({ status: feedback ? 'ready' : 'pending', feedback: feedback ?? null });
  } catch (error) { return routeError(error); }
}
