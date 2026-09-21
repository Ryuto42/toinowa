export function guardEventAction(rule: string): string {
  if (rule === 'wellbeing_keyword') return '相談の合図を記録';
  if (rule === 'wellbeing_support') return '学習を休止・相談対応';
  if (rule === 'conversation_boundary') return '言葉遣いへの注意';
  return '遮断';
}
