import { requireAuth } from '@/lib/auth/guard';
import { createConversation, conversationCreateSchema, listConversations } from '@/lib/conversation/service';
import { json, parseJson, routeError } from '@/lib/api/http';

export async function GET(request: Request) {
  try {
    const context = await requireAuth();
    const studentId = new URL(request.url).searchParams.get('studentId') ?? undefined;
    return json({ conversations: await listConversations(context, studentId) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAuth();
    const body = await parseJson(request, conversationCreateSchema);
    return json({ conversation: await createConversation(context, body) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
