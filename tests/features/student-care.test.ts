import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const model = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orcarouter/call', () => ({ callModel: model }));
import { classifyStudentCare } from '@/lib/security/student-care-agent';
import { activeCare, canResumeLearning, careReply, fallbackCare, immediateCare, isLearningMessage } from '@/lib/security/student-care';
import { guardEventAction } from '@/lib/security/guard-event-label';
import { buildConversationContext } from '@/lib/conversation/context';
const trace = { traceId: 'trace', tenantId: 'tenant', studentId: 'student' };
beforeEach(() => { model.mockReset(); });

describe('相談を学習より優先する判定', () => {
  it('具体的ないじめの単語が出る前のSOSを拾い、有料判定を待たない', async () => {
    const result = await classifyStudentCare('あの、先生、もう学校行きたくないです助けてください', [], trace);
    expect(result).toMatchObject({ category: 'distress', source: 'rule' });
    expect(model).not.toHaveBeenCalled();
  });
  it('固定の危険語がない孤立の訴えを、文脈付きの意味分類へ渡す', async () => {
    const text = '明日もあの席に座ると思うと息が詰まる';
    const history = [{ actor: 'student', content_redacted: '教室では誰も私に返事しない' }];
    model.mockResolvedValue({ data: { category: 'distress', resumeLearning: false, evidence: text, reason: '孤立と登校への不安の訴え' }, meta: { runId: 'run', degraded: false } });
    expect(await classifyStudentCare(text, history, trace)).toMatchObject({ category: 'distress', source: 'model' });
    expect(model.mock.calls[0][0]).toMatchObject({ modelClass: 'economy', requestType: 'student_care', maxOutputTokens: 400 });
    expect(JSON.stringify(model.mock.calls[0][0].messages)).toContain(history[0].content_redacted);
  });
  it('教材の引用は単語だけで確定せず、意味分類する', async () => {
    const text = '小説の「死にたい」という台詞の意味を説明します';
    expect(immediateCare(text)).toBeNull();
    model.mockResolvedValue({ data: { category: 'normal', evidence: '', reason: '教材の説明', resumeLearning: false }, meta: { runId: 'run' } });
    expect((await classifyStudentCare(text, [], trace)).category).toBe('normal');
  });
  it('判定停止時も暴言へ境界を伝え、単なる暴言を緊急相談にしない', async () => {
    model.mockRejectedValue(new Error('provider unavailable'));
    const decision = await classifyStudentCare('ばーかばーか', [], trace);
    expect(decision.category).toBe('hostility');
    expect(careReply(decision.category, false)).toContain('相手を傷つける言葉');
  });
  it('暴言を言われた被害相談は意味で区別する', async () => {
    const text = '毎日ばかと言われて教室でひとりです';
    model.mockResolvedValue({ data: { category: 'child_safety', resumeLearning: false, evidence: text, reason: '被害の相談' }, meta: {} });
    expect((await classifyStudentCare(text, [], trace)).category).toBe('child_safety');
  });
  it('AIの作った根拠・判定失敗を正常とみなさない', async () => {
    model.mockResolvedValue({ data: { category: 'self_harm', resumeLearning: false, evidence: '入力にない引用', reason: '理由' }, meta: {} });
    expect((await classifyStudentCare('こんにちは', [], trace)).category).toBe('unavailable');
    expect(fallbackCare('光合成を説明します').category).toBe('unavailable');
  });
  it('相談を評価・要約から外し、再表示後も明示的な再開まで休止する', () => {
    const history = [
      { actor: 'student', content_redacted: '不定積分は微分の逆です' },
      { actor: 'student', content_redacted: '学校に行きたくない', safety_flags: { student_care: ['distress'] } },
      { actor: 'agent', content_redacted: '話してくれてありがとう', safety_flags: { student_care: ['distress'] } },
    ];
    expect(activeCare(history)).toBe('distress');
    expect(history.filter(isLearningMessage)).toHaveLength(1);
    expect(buildConversationContext('', history)).not.toContain('学校');
    expect(activeCare([...history, { actor: 'agent', content_redacted: '再開', safety_flags: { student_care: ['resume'] } }])).toBeNull();
  });
  it.each(['再開しようかな', 'また勉強しよっか！', 'じゃ、さっきのやつ教えるね', 'もう無理じゃないので続けたい', '「続きをやろう」って今は思う'])('表現ルールで意味判定を上書きしない: %s', text => {
    expect(canResumeLearning({ category: 'normal', evidence: '', reason: text, resumeLearning: true })).toBe(true);
  });
  it('休止中という状態を伝え、モデルが判断した再開意思を使う', async () => {
    const text = 'また勉強しよっか！';
    const history = [{ actor: 'agent', content_redacted: '今、安心できる場所にいますか？', safety_flags: { student_care: ['distress'] } }];
    model.mockResolvedValue({ data: { category: 'normal', evidence: '', reason: '学習への誘い', resumeLearning: true }, meta: {} });
    expect(canResumeLearning(await classifyStudentCare(text, history, trace))).toBe(true);
    expect(JSON.stringify(model.mock.calls[0][0].messages)).toContain('learning_paused');
    const reference = model.mock.calls[0][0].messages[1].content;
    const input = JSON.parse(reference.split('<reference>\n')[1].split('\n</reference>')[0]);
    expect(JSON.parse(model.mock.calls[0][0].messages.at(-1).content)).toEqual({ latest_student_message: text });
    expect(input.learning_paused).toBe(true);
    expect(input.recent_conversation).toEqual([{ actor: 'agent', text: history[0].content_redacted }]);
  });
  it('必須の再開判定が欠落していたら、正常完了に見せない', async () => {
    model.mockResolvedValue({ data: { category: 'normal', evidence: '', reason: '挨拶' }, meta: {} });
    expect((await classifyStudentCare('こんにちは', [], trace)).category).toBe('unavailable');
  });
  it('言い回しが定型でもAIが再開意思を確認できなければ勝手に再開しない', () => {
    expect(canResumeLearning({ category: 'normal', evidence: '勉強に戻る', reason: '引用', resumeLearning: false })).toBe(false);
  });
  it.each(['self_harm', 'danger', 'child_safety', 'unavailable'] as const)('再開希望と一緒に危険等を検出した時は支援を優先: %s', category => {
    expect(canResumeLearning({ category, evidence: '', reason: '', resumeLearning: true })).toBe(false);
  });
  it('相談応答に内部処理や先生への連絡の説明を挟まない', () => {
    for (const category of ['distress', 'child_safety', 'self_harm', 'danger'] as const) {
      expect(careReply(category)).not.toMatch(/記録|一覧|先生に伝|確認される/);
      expect(careReply(category, true)).not.toMatch(/記録|一覧|先生に伝|確認される/);
    }
    expect(careReply('distress', true)).not.toContain('不定積分');
    expect(careReply('self_harm', true)).toContain('今すぐ助け');
  });
  it('共有範囲を聞かれたら、秘密や連絡済みという誤解を与えない', () => {
    const reply = careReply('distress', true, '先生には内緒にしてほしい');
    expect(reply).toContain('担当の先生や管理者が確認できる');
    expect(reply).toContain('秘密と約束することはできません');
    expect(reply).not.toMatch(/記録しました|伝えました/);
  });
  it('相談の記録と危険な指示の遮断を混同しない', () => {
    expect(guardEventAction('wellbeing_keyword')).toBe('相談の合図を記録');
    expect(guardEventAction('wellbeing_support')).toBe('学習を休止・相談対応');
    expect(guardEventAction('instruction_override')).toBe('遮断');
  });
});
