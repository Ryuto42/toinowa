import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ get: vi.fn(), rate: vi.fn(), transcribe: vi.fn(), role: 'student' }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/auth/guard', () => ({ requireAuth: async () => ({ tenantId: 'tenant', userId: 'student', role: m.role }) }));
vi.mock('@/lib/conversation/service', () => ({ getConversation: m.get }));
vi.mock('@/lib/api/rate-limit', () => ({ assertAiRateLimit: m.rate }));
vi.mock('@/lib/voice/transcribe', () => ({ transcribeChunk: m.transcribe }));
vi.mock('@/lib/security/escalate', () => ({ reportSafetyBlock: vi.fn() }));
import { POST } from '@/app/api/voice/transcribe/route';
import { ForbiddenError } from '@/lib/auth/errors';
import { encodeWav } from '@/lib/voice/record';
async function send() {
  const audio = Buffer.from(await encodeWav(new Float32Array(160), 16000).arrayBuffer()).toString('base64');
  return POST(new Request('http://localhost/api/voice/transcribe', { method: 'POST', body: JSON.stringify({ conversationId: '11111111-1111-4111-8111-111111111111', audio, format: 'wav' }) }));
}
beforeEach(() => { vi.clearAllMocks(); m.role = 'student'; m.get.mockResolvedValue({ student_id: 'student', state: 'active' }); m.transcribe.mockResolvedValue({ data: { text: '傾きは変化量です', hesitation: 0 } }); });
describe('音声の会話スコープ', () => {
  it('本人の進行中の会話だけを書き起こす', async () => { expect((await send()).status).toBe(200); expect(m.transcribe).toHaveBeenCalledOnce(); });
  it('別の生徒・所属の会話はモデルを呼ぶ前に拒否する', async () => { m.get.mockRejectedValue(new ForbiddenError()); expect((await send()).status).toBe(403); expect(m.transcribe).not.toHaveBeenCalled(); });
  it('既に終了した会話では新たに課金しない', async () => { m.get.mockResolvedValue({ student_id: 'student', state: 'completed' }); expect((await send()).status).toBe(409); expect(m.rate).not.toHaveBeenCalled(); expect(m.transcribe).not.toHaveBeenCalled(); });
  it('先生・管理者の音声入力は拒否する', async () => { m.role = 'teacher'; expect((await send()).status).toBe(403); expect(m.get).not.toHaveBeenCalled(); expect(m.transcribe).not.toHaveBeenCalled(); });
});
