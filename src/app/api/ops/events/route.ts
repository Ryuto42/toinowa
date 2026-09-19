import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { routeError } from '@/lib/api/http';

export async function GET() {
  try {
    const context = await requireRole('teacher', 'admin');
    const { data, error } = await adminDb().from('agent_runs').select('id,agent_name,status,resolved_model,latency_ms,fallback_count,created_at')
      .eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(25);
    if (error) throw new Error(error.message);
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify({ runs: data ?? [] })}\n\n`));
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
        controller.close();
      },
    });
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (error) {
    return routeError(error);
  }
}
