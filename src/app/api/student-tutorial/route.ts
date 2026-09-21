import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError } from '@/lib/api/http';
import { getConversation, listMessages } from '@/lib/conversation/service';
import { TUTORIAL_OPENING } from '@/lib/tutorial/content';
export async function POST() {
  try {
    const context = await requireRole('student');
    const result = await adminDb().rpc('start_student_tutorial', { p_tenant: context.tenantId, p_student: context.userId, p_opening: TUTORIAL_OPENING });
    if(result.error) throw new Error(result.error.message);
    const [conversation,messages] = await Promise.all([getConversation(context,result.data),listMessages(context,result.data)]);
    return json({conversation,messages});
  } catch(error) { return routeError(error); }
}
