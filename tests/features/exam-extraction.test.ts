import {describe,expect,it} from 'vitest';
import {examExtractionSchema,inspectExamRows,summarizeExamExtraction,type ExamRow} from '../../scripts/benchmarks/structured-extraction';
const row=(values:Partial<ExamRow>={}):ExamRow=>({section:'unit',subject:'数学',unit:'一次方程式',question:'1',score:8,maxScore:20,nationalDeviation:null,nationalMeanPoints:6,uncertain:false,...values});
const page=(rows:ExamRow[])=>({rows,uncertainties:[]});
describe('exam extraction separates facts from suggestions',()=>{
 it('computes score rate and mean difference without confusing points with percentages',()=>{
  const result=summarizeExamExtraction([page([row(),row({question:'2',unit:'関数',score:4,nationalMeanPoints:10})])]);
  expect(result.text).toContain('全国平均点 6点');
  expect(result.text).toContain('本人の得点率 40%');
  expect(result.text).toContain('平均との差 2点');
  expect(result.weakAreas).toContain('関数');
  expect(result.weakAreas).not.toContain('一次方程式');
  expect(result.dailyTimeLimitMin).toBe(20);
 });
 it('keeps actual and converted scores separate and never uses a converted score as a weakness',()=>{
  const subject=row({section:'subject',unit:null,question:null,score:80,maxScore:100,nationalMeanPoints:null,nationalDeviation:60});
  const result=summarizeExamExtraction([page([subject,{...subject,section:'converted',score:35,nationalDeviation:null}])]);
  expect(result.text).toContain('【科目別成績】');expect(result.text).toContain('【換算得点（実得点とは別）】');
  expect(result.rationale).toContain('苦手と断定するものではありません');
 });
 it('excludes unreadable rows and impossible scores, while retaining valid evidence',()=>{
  const result=summarizeExamExtraction([page([row({score:25}),row({question:'2',uncertain:true}),row({question:'3',unit:'図形',score:5})])]);
  expect(result.text).not.toContain('25/20');expect(result.text).not.toContain('設問2');
  expect(result.text).toContain('図形');expect(result.uncertainties).toHaveLength(2);
 });
 it('excludes every copy of a conflicting row, independent of arrival order',()=>{
  const first=row(),second=row({score:7}),other=row({question:'2',unit:'図形'});
  for(const rows of [[first,second,other],[second,first,other]]){
   const result=inspectExamRows([page(rows)]);
   expect(result.accepted).toEqual([other]);expect(result.issues).toHaveLength(1);
  }
 });
 it('does not fill in missing scores from totals or infer a weak unit from absent averages',()=>{
  const result=summarizeExamExtraction([page([row({nationalMeanPoints:null,score:2})])]);
  expect(result.weakAreas).toBe('');expect(result.learningGoal).toBe('');expect(result.dailyTimeLimitMin).toBeNull();
  expect(result.text).not.toContain('全国平均点');expect(result.uncertainties).not.toHaveLength(0);
 });
 it('rejects all-unusable data and invalid numerical types',()=>{
  expect(()=>summarizeExamExtraction([page([row({uncertain:true})])])).toThrow('計画に使用できる');
  expect(examExtractionSchema.safeParse(page([row({score:NaN})])).success).toBe(false);
  expect(inspectExamRows([page([row({maxScore:0}),row({nationalMeanPoints:30})])]).accepted).toHaveLength(0);
 });
 it('retains distinct repeated question names by question number and collapses identical repeated rows',()=>{
  const first=row({subject:'英語',unit:'長文読解',question:'4'}),second={...first,question:'5'};
  expect(inspectExamRows([page([first,second,first])]).accepted).toEqual([first,second]);
 });
});
