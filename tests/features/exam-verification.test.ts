import { describe, expect, it } from 'vitest';
import { inspectExamRows, inspectExamPages, buildExamProposal, type ExamRow, type ExamPage } from '@/lib/materials/exam-extraction';
const row = (values: Partial<ExamRow> = {}): ExamRow => ({ section: 'subject', subject: '数学', unit: null, question: null, score: 60, maxScore: 100, nationalDeviation: 55, nationalMeanPoints: null, uncertain: false, ...values });
const page = (rows: ExamRow[]): ExamPage => ({ tables: [{ heading: '科目別成績', populationHeading: '全国', scoreColumnHeading: '得点', maxColumnHeading: '満点', deviationColumnHeading: '偏差値', meanColumnHeading: '', rows }], uncertainties: [] });
describe('exam evidence and complementary duplicate verification', () => {
  it('merges repeated matching values and missing cells in either order', () => {
    const complete = row(), partial = row({ subject: '数 学', score: null, maxScore: null });
    for (const rows of [[complete, partial], [partial, complete]]) {
      const result = inspectExamRows([{ rows, uncertainties: [] }]);
      expect(result.issues).toEqual([]); expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0]).toMatchObject({ score: 60, maxScore: 100, nationalDeviation: 55 });
    }
  });
  it('holds conflicting values even when another duplicate agrees', () => {
    const result = inspectExamRows([{ rows: [row(), row({ nationalDeviation: 48 }), row()], uncertainties: [] }]);
    expect(result.accepted).toEqual([]); expect(result.issues).not.toHaveLength(0);
  });
  it('detects an impossible score created by complementary merging', () => {
    const result = inspectExamRows([{ rows: [row({ score: 60, maxScore: null }), row({ score: null, maxScore: 50 })], uncertainties: [] }]);
    expect(result.accepted).toEqual([]);
  });
  it('retains raw and converted scores separately', () => {
    const p = page([row()]); p.tables.push({ ...p.tables[0], heading: '共通テスト換算得点', rows: [row({ section: 'converted', score: 80, nationalDeviation: null })] });
    expect(inspectExamPages([p]).accepted).toHaveLength(2); expect(buildExamProposal([p]).reviewRequired).toBe(false);
  });
  it('excludes private deviation tables and holds mislabeled converted tables', () => {
    const p = page([row()]); p.tables.push({ ...p.tables[0], heading: '私大評価用偏差値', rows: [row({ nationalDeviation: 42 })] });
    const valid = inspectExamPages([p]); expect(valid.accepted).toHaveLength(1); expect(valid.excludedHeadings).toEqual(['私大評価用偏差値']);
    p.tables[1].heading = '共通テスト換算得点';
    expect(buildExamProposal([p]).reviewRequired).toBe(true);
  });
  it('never treats local deviations, percentile graphs or absent headings as verified evidence', () => {
    for (const change of [{ populationHeading: '校内' }, { heading: '' }, { deviationColumnHeading: '順位' }]) {
      const p = page([row()]); Object.assign(p.tables[0], change);
      expect(buildExamProposal([p]).reviewRequired).toBe(true); expect(inspectExamPages([p]).accepted).toHaveLength(0);
    }
    const p = page([row({ section: 'unit', unit: '図形', question: '1', nationalDeviation: null, nationalMeanPoints: 40 })]);
    Object.assign(p.tables[0], { heading: '設問別成績', meanColumnHeading: '全国平均得点率(%)' });
    expect(buildExamProposal([p]).reviewRequired).toBe(true);
  });
  it('computes points/rates and selects only below-average units', () => {
    const p = page([row({ section: 'unit', unit: '図形', question: '1', score: 8, maxScore: 20, nationalDeviation: null, nationalMeanPoints: 6 }), row({ section: 'unit', unit: '関数', question: '2', score: 4, maxScore: 20, nationalDeviation: null, nationalMeanPoints: 10 })]);
    Object.assign(p.tables[0], { heading: '設問別成績', meanColumnHeading: '全国平均点' });
    const result = buildExamProposal([p]); expect(result.reviewRequired).toBe(false);
    expect(result.proposal.text).toContain('本人の得点率 40%'); expect(result.proposal.weakAreas).toContain('関数'); expect(result.proposal.weakAreas).not.toContain('図形');
  });
  it('holds a page that reports uncertainty even if rows look valid', () => {
    const p = page([row()]); p.uncertainties.push('全国の見出しが不鮮明');
    expect(buildExamProposal([p]).reviewRequired).toBe(true);
  });
  it('uses printed conversion subheadings and ignores unscored subject averages', () => {
    const p = page([row({ subject:'理科', unit:'物理', nationalMeanPoints:40 })]);
    p.tables.push({ ...p.tables[0], heading:'合格可能性評価用成績', scoreColumnHeading:'換算得点', rows:[row({ section:'converted', nationalDeviation:null })] });
    const inspected = inspectExamPages([p]);
    expect(inspected.issues).toEqual([]);
    expect(inspected.accepted[0]).toMatchObject({ subject:'理科 物理', unit:null, nationalMeanPoints:null });
    expect(buildExamProposal([p]).reviewRequired).toBe(false);
  });
  it('preserves doubtful numeric candidates for human review without authorizing automatic application', () => {
    const p = page([row()]); p.tables[0].heading = '不明な表';
    const result = buildExamProposal([p]);
    expect(result.reviewRequired).toBe(true); expect(result.proposal.text).toContain('60/100');
    expect(result.proposal.learningGoal).toBe(''); expect(inspectExamPages([p]).accepted).toEqual([]);
  });
  it('sends rows whose subject could not be read to review instead of applying them', () => {
    for (const section of ['subject', 'aggregate', 'converted', 'unit'] as const) {
      for (const subject of ['', '   ']) {
        const result = inspectExamRows([{
          rows: [row({
            section,
            subject,
            unit: section === 'unit' ? '大問1' : null,
            question: section === 'unit' ? '1' : null,
            nationalDeviation: section === 'converted' || section === 'unit' ? null : 45,
          })],
          uncertainties: [],
        }]);
        expect(result.accepted).toEqual([]); expect(result.issues).not.toHaveLength(0);
      }
    }
    const proposal = buildExamProposal([page([row({ subject: '', score: 41, nationalDeviation: 45 })])]);
    expect(proposal.reviewRequired).toBe(true); expect(proposal.reviewReasons).not.toHaveLength(0);
  });
});
