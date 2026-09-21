import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const model = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orcarouter/call', () => ({ callModel: model }));
import { transcribeChunk } from '@/lib/voice/transcribe';
beforeEach(() => model.mockReset());
it('参考文をsystem命令に混ぜず、今回の音声だけを書き起こす契約にする', async () => {
  const spoken = '微分と積分がお互い逆みたいな感じ';
  model.mockResolvedValue({ data: { text: spoken, hesitation: 0 }, meta: {} });
  const result = await transcribeChunk({ audioBase64: 'test', format: 'wav', topic: '不定積分', previousText: '微分を覚えています', trace: { tenantId: 'tenant', traceId: 'trace' } });
  expect(result.data.text).toBe(spoken);
  const messages = model.mock.calls[0][0].messages;
  expect(messages[0].content).not.toContain('微分を覚えています');
  expect(messages[0].content).toContain('空文字');
  expect(messages[1].content[0].text).toContain('微分を覚えています');
  expect(messages[1].content[1]).toEqual({ type: 'input_audio', input_audio: { data: 'test', format: 'wav' } });
});
it('聞き取れなかった区切りを過去の参考文で埋めない', async () => {
  model.mockResolvedValue({ data: { text: '', hesitation: 0 }, meta: {} });
  const result = await transcribeChunk({ audioBase64: 'silence', format: 'wav', previousText: '聞こえた発言', trace: { tenantId: 'tenant', traceId: 'trace' } });
  expect(result.data.text).toBe('');
});
