import fs from 'node:fs/promises';
import {examAnalysisResultSchema} from '../../src/lib/materials/exam-analysis';
import {preCheck,postCheck} from '../../src/lib/security/guard';
const dir='benchmark-data/exams/runs/responses',records=[];
for(const file of await fs.readdir(dir)){
 const r=JSON.parse(await fs.readFile(dir+'/'+file,'utf8'));let parsed,cleaned,maskedKinds:string[]=[],accepted=false,error;
 try{parsed=JSON.parse(r.data?.choices?.[0]?.message?.content);parsed=examAnalysisResultSchema.parse(parsed);postCheck(JSON.stringify(parsed));preCheck(JSON.stringify(parsed));const checked=preCheck(JSON.stringify(parsed));cleaned=examAnalysisResultSchema.parse(JSON.parse(checked.masked.text));maskedKinds=checked.masked.matches.map(x=>x.kind);accepted=true;}catch(e){error=String(e);}
 records.push({...r,schemaAndGuardsPass:accepted,validationError:error,parsed,cleaned,maskedKinds});
}
records.sort((a,b)=>a.case.localeCompare(b.case)||String(a.resolvedModel).localeCompare(String(b.resolvedModel))||a.startedAt.localeCompare(b.startedAt));
await fs.writeFile('benchmark-data/exams/runs/validated.json',JSON.stringify(records,null,2));
if(process.argv[2])for(const r of records.filter(x=>x.case===process.argv[2]))console.log('\nID',r.id,'MODEL',r.resolvedModel,'MS',r.elapsedMs,'VALID',r.schemaAndGuardsPass,'\n'+(process.argv[3]==='all'?JSON.stringify(r.parsed,null,2):r.parsed?.text??r.validationError));
else console.log(records.map(r=>({case:r.case,model:r.resolvedModel,valid:r.schemaAndGuardsPass,ms:r.elapsedMs,cost:r.costUsd})));
