import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRecorder } from '@/lib/voice/record';

let port: { onmessage: ((event: { data: Float32Array }) => void) | null };
const stopTrack = vi.fn();
const close = vi.fn(async () => {});
const onChunk = vi.fn();
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) } });
  vi.stubGlobal('AudioContext', class {
    sampleRate = 16_000;
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource = node;
    createAnalyser = node;
    close = close;
  });
  vi.stubGlobal('AudioWorkletNode', class {
    port = port = { onmessage: null };
    disconnect = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());
function frames(amplitude: number, count: number) {
  for (let n = 0; n < count; n++) port.onmessage?.({ data: new Float32Array(1600).fill(amplitude) });
}
describe('録音の無音区切り', () => {
  it('発話の後の無音・停止時の無音を追加の書き起こしに送らない', async () => {
    const stop = await startRecorder({ onChunk, onLevel: vi.fn() });
    frames(0.08, 10); frames(0, 30);
    expect(onChunk).toHaveBeenCalledTimes(1);
    await stop(); await stop();
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('無音だけ・小さな環境ノイズだけなら送らない', async () => {
    const stop = await startRecorder({ onChunk, onLevel: vi.fn() });
    frames(0, 30); frames(0.0001, 30); await stop();
    expect(onChunk).not.toHaveBeenCalled();
  });
  it('短い返答と小声を、区切り用の閾値だけで捨てない', async () => {
    const stop = await startRecorder({ onChunk, onLevel: vi.fn() });
    frames(0.005, 2); await stop();
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk.mock.calls[0][0].seconds).toBeCloseTo(0.2);
  });
});
