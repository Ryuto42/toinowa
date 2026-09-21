// Frozen reference; offline scoring only. v2 and v3 raw scores use the same cells.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateExamPage, inspectExamPages, buildExamProposal, type ExamRow } from '../../src/lib/materials/exam-extraction';
import { preCheck, postCheck } from '../../src/lib/security/guard';
const root='benchmark-data/exams', dir=`${root}/runs-evidence-v3`;
const ref=JSON.parse(await readFile(`${root}/reference.json`,'utf8'));assert.equal(ref.status,'user_verified');
const normal=(s:string)=>s.normalize('NFKC').replace(/[\s・、,（）()－−-]/g,'');
const aliases:Record<string,string[]>={ '数学①（数学IA）':['数学①','数学IA','数学①数学IA'], '数学②（数学IIB）':['数学②','数学IIB','数学②数学IIB'], '総合1（5－7理系）':['総合1','総合15-7理系'], '総合2（理系）':['総合2','総合2理系'], '5－7理系型':['5-7理系'], '物理':['理科物理'], '化学':['理科化学'], '地理B':['地歴公民地理B'] };
const targets=(group:string)=>group==='C'?ref.C.items.map((r:(string|number)[])=>({section:'unit',name:String(r[0]),question:String(r[1]),unit:normal(String(r[2])),fields:['score','maxScore','nationalMeanPoints'],values:r.slice(3,6)})):
  [...ref[group].raw.map((r:(string|number|null)[])=>({section:'raw',name:String(r[0]),fields:['score','maxScore','nationalDeviation'],values:r.slice(1)})),...(group==='A'?ref.A.converted.map((r:(string|number)[])=>({section:'converted',name:String(r[0]),fields:['score','maxScore'],values:r.slice(1)})):[])];
type Target={section:string;name:string;question?:string;unit?:string;fields:(keyof ExamRow)[];values:(number|null)[]};
function matches(t:Target,r:ExamRow){
 if(t.section==='unit')return r.section==='unit'&&normal(r.subject)===normal(t.name)&&normal(r.question??'')===t.question&&!!r.unit&&(normal(r.unit).startsWith(t.unit!)||t.unit!.startsWith(normal(r.unit)));
 if(t.section==='converted'?r.section!=='converted':!['subject','aggregate'].includes(r.section))return false;
 const names=[t.name,...(aliases[t.name]??[])].map(normal);return [r.subject,r.unit??'',r.subject+(r.unit??'')].some(s=>names.includes(normal(s)));
}
const records=await Promise.all((await readdir(`${dir}/responses`)).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(`${dir}/responses/${f}`,'utf8'))));
const fields:Record<string,unknown>[]=[];const scored=[];
for(const id of ['A_scan','B_scan','C_scan']){
 const trials=records.filter(r=>r.case===id).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));if(!trials.length)continue;
 const request=JSON.parse(await readFile(`${root}/requests-evidence-v3/${id}.json`,'utf8'));
 for(const [index,r] of trials.entries()){
  assert.equal(r.requestSha256,createHash('sha256').update(JSON.stringify(request.body)).digest('hex'));
  const model=index===0?'gemini-2.5-flash':'gemini-2.5-pro';if(r.resolvedModel)assert.equal(r.resolvedModel,model);
  let rows:ExamRow[]=[],accepted:ExamRow[]=[],valid=false,reviewRequired=true,reviewReasons:string[]=[],error:string|undefined;
  try{
   assert.equal(r.status,'response');const parsed=validateExamPage(JSON.parse(r.data.choices[0].message.content));postCheck(JSON.stringify(parsed));preCheck(JSON.stringify(parsed));
   rows=parsed.tables.flatMap(t=>t.rows);accepted=inspectExamPages([parsed]).accepted;valid=true;
   ({reviewRequired,reviewReasons}=buildExamProposal([parsed]));
  }catch(e){error=String(e);}
  const count={correct:0,wrong:0,missing:0,ambiguous:0,unusable:0,acceptedCorrect:0,acceptedWrong:0};
  for(const t of targets(id[0]) as Target[])for(const [i,expected]of t.values.entries()){
   if(expected===null)continue;const field=t.fields[i];
   const values=[...new Set(rows.filter(row=>matches(t,row)).map(row=>row[field]).filter(v=>v!==null))];
   const actual=values.length===1?values[0]:null;
   const status=!valid?'unusable':values.length>1?'ambiguous':actual===null?'missing':actual===expected?'correct':'wrong';count[status]++;
   const checked=[...new Set(accepted.filter(row=>matches(t,row)).map(row=>row[field]).filter(v=>v!==null))];
   const checkedValue=checked.length===1?checked[0]:null;
   if(checkedValue===expected)count.acceptedCorrect++;else if(typeof checkedValue==='number')count.acceptedWrong++;
   fields.push({id:r.id,case:id,model,row:t.name,question:t.question,field,expected,actual,status,checkedValue});
  }
  scored.push({id:r.id,case:id,model,supplemental:id==='C_scan',...count,total:count.correct+count.wrong+count.missing+count.ambiguous+count.unusable,valid,reviewRequired,reviewReasons,error,elapsedMs:r.elapsedMs,costUsd:r.costUsd});
 }
}
await writeFile(`${dir}/scores.json`,JSON.stringify({method:'Frozen reference numeric cells; semantic row matching identical in intent to v2. Extraction accuracy, post-validation accepted cells and automatic-application gate reported separately. Source-heading fidelity requires separate manual review. A/B are targeted paired comparison; C is supplementary product-path validation, not part of Pro comparison.',scored},null,2));
const keys=Object.keys(fields[0]??{});await writeFile(`${dir}/field-scores.csv`,keys.join(',')+'\n'+fields.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(',')).join('\n'));
console.table(scored.map(r=>({case:r.case,model:r.model,correct:r.correct,total:r.total,accepted:r.acceptedCorrect,acceptedWrong:r.acceptedWrong,review:r.reviewRequired,ms:r.elapsedMs,cost:r.costUsd})));
