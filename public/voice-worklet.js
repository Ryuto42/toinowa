/**
 * マイクの生PCMをメインスレッドへ渡すだけの AudioWorklet。
 *
 * Blob URL で読み込むと CSP の script-src に blob: を足す必要が出るため、
 * 静的ファイルとして置き 'self' の範囲で収める。
 */
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(new Float32Array(channel));
    return true;
  }
}
registerProcessor('tap', Tap);
