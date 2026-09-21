import { describe, expect, it } from 'vitest';
import { tutorialAudienceForGrade, tutorialOpening, TUTORIAL_OPENING } from '@/lib/tutorial/content';

describe('登録学年に合わせた初回案内', () => {
  it.each([
    ['小学1年生', 'elementary'], ['小学校３年生', 'elementary'], ['小６', 'elementary'],
    ['中学2年', 'junior'], ['中学校二年生', 'junior'], [' 中 ２ ', 'junior'],
    ['高校1年生', 'senior'], ['高等学校３年', 'senior'], ['高２', 'senior'],
    [null, 'general'], ['', 'general'], ['2年生', 'general'], ['大学2年生', 'general'],
  ] as const)('%sを適切に分類する', (grade, audience) => {
    expect(tutorialAudienceForGrade(grade)).toBe(audience);
  });
  it('年齢不明なら決めつけず、全学年で好きなことと送信方法を案内する', () => {
    expect(tutorialOpening('general')).toBe(TUTORIAL_OPENING);
    expect(tutorialOpening('elementary')).toContain('すきなこと');
    expect(tutorialOpening('senior')).not.toContain('AIだよ');
    for (const audience of ['elementary','junior','senior','general'] as const) {
      const opening = tutorialOpening(audience);
      expect(opening).toContain('送信');
      expect(opening.length).toBeLessThan(250);
    }
  });
});
