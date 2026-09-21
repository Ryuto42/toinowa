import { describe, expect, it } from 'vitest';
import { detectWellbeing } from '@/lib/security/wellbeing';

describe('detectWellbeing', () => {
  it('自傷をうかがわせる書き込みを拾う', () => {
    expect(detectWellbeing('最近つらくて死にたいと思う')).toEqual({ category: 'self_harm', matched: ['死にたい'] });
  });

  it('自傷を子どもの安全より優先する', () => {
    const signal = detectWellbeing('いじめられていて消えたい');
    expect(signal?.category).toBe('self_harm');
  });

  it('子どもの安全に関わる書き込みを拾う', () => {
    expect(detectWellbeing('家に帰りたくない')?.category).toBe('child_safety');
  });

  // 教材の文章で誤検知すると、要フォローがノイズで埋まって本物が埋もれる。
  it('通常の学習内容では反応しない', () => {
    expect(detectWellbeing('摩擦は無視できるものとします')).toBeNull();
    expect(detectWellbeing('裸子植物と被子植物のちがいを説明します')).toBeNull();
    expect(detectWellbeing('光合成は葉緑体で行われます')).toBeNull();
  });

  it('ゼロ幅文字での回避を許さない', () => {
    expect(detectWellbeing('死​にたい')?.category).toBe('self_harm');
  });
});
