// Manual semantic transcription of each response's text, keyed to the user-verified reference.
// Never award points for a number appearing elsewhere in the answer.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const ref=JSON.parse(await fs.readFile('benchmark-data/exams/reference.json','utf8'));
assert.equal(ref.status,'user_verified');
const responses=JSON.parse(await fs.readFile('benchmark-data/exams/runs/validated.json','utf8'));
const targets={A:[...ref.A.raw.map(r=>({key:'raw/'+r[0],fields:['score','max','nationalDeviation'],values:r.slice(1)})),...ref.A.converted.map(r=>({key:'converted/'+r[0],fields:['score','max'],values:r.slice(1)}))],B:ref.B.raw.map(r=>({key:'raw/'+r[0],fields:['score','max','nationalDeviation'],values:r.slice(1)})),C:ref.C.items.map(r=>({key:r[0]+'/'+r[1]+'/'+r[2],fields:['score','max','nationalMeanPoints'],values:r.slice(3,6)}))};
const rules=JSON.parse(await fs.readFile('benchmark-data/exams/runs/manual-annotations.json','utf8'));
const scored=[];const fieldRows=[];
for(const r of responses.filter(x=>x.timeoutMs===60000)){
 const key=r.case+'|'+r.resolvedModel,rule=rules[key];if(!rule)continue;
 const target=targets[r.case[0]];let correct=0,wrong=0,missing=0,ambiguous=0,unusable=0,blankFabrications=0;
 for(let i=0;i<target.length;i++)for(let j=0;j<target[i].values.length;j++){
  const expected=target[i].values[j],actual=rule.rows[i].values[j];
  if(expected===null){if(typeof actual==='number')blankFabrications++;continue;}
  const status=!r.schemaAndGuardsPass?'unusable':actual==='AMBIGUOUS'?'ambiguous':actual===null?'missing':actual===expected?'correct':'wrong';
  if(status==='correct')correct++;else if(status==='wrong')wrong++;else if(status==='missing')missing++;else if(status==='ambiguous')ambiguous++;else unusable++;
  fieldRows.push({responseId:r.id,case:r.case,model:r.resolvedModel,row:target[i].key,field:target[i].fields[j],expected,actual,status});
 }
 const total=correct+wrong+missing+ambiguous+unusable;
 scored.push({id:r.id,case:r.case,model:r.resolvedModel,correct,wrong,missing,ambiguous,unusable,total,accuracy:correct/total,allTargetFieldsMatch:correct===total,blankFabrications,schemaAndGuardsPass:r.schemaAndGuardsPass,elapsedMs:r.elapsedMs,within15s:r.elapsedMs<=15000,costUsd:r.costUsd,notes:rule.notes,responseTextSha256:createHash('sha256').update(r.parsed?.text??r.data?.choices?.[0]?.message?.content??'').digest('hex')});
}
await fs.writeFile('benchmark-data/exams/runs/scores.json',JSON.stringify({method:'Assistant manual semantic row/column alignment against user-verified reference, numeric equality after transcription; omitted or ambiguous fields receive no credit. Reference null cells excluded from denominator; proposals/auxiliary columns separate.',scored,unreviewed:responses.filter(r=>r.timeoutMs===60000&&!rules[r.case+'|'+r.resolvedModel]).map(r=>r.id)},null,2));
const csv=(rows)=>{const keys=Object.keys(rows[0]??{});return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';};
await fs.writeFile('benchmark-data/exams/runs/field-scores.csv',csv(fieldRows));
await fs.writeFile('benchmark-data/exams/runs/summary.csv',csv(scored.map(({notes,...r})=>r)));
console.log(scored.map(({case:c,model,correct,wrong,missing,ambiguous,unusable,total})=>({case:c,model,correct,wrong,missing,ambiguous,unusable,total})));
