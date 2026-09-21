import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {examAnalysisResultSchema} from '../../src/lib/materials/exam-analysis';
const source=await readFile('src/lib/jobs/exam-handler.ts','utf8');
const match=source.match(/role: 'system', content: '([^']+)'/);
if(!match)throw Error('Cannot locate exact application prompt');
const schema=z.toJSONSchema(examAnalysisResultSchema,{io:'output'});
await mkdir('benchmark-data/exams/requests',{recursive:true});
for(const group of ['A','B','C'])for(const condition of ['scan','clear','shadow']){
 const id=`${group}_${condition}`;const images=JSON.parse(await readFile(`benchmark-data/exams/normalized/${id}.json`,'utf8'));
 const body={model:'google/gemini-2.5-flash-lite',messages:[{role:'system',content:match[1]},{role:'user',content:images.map((url:string)=>({type:'image_url',image_url:{url}}))}],max_tokens:6000,response_format:{type:'json_schema',json_schema:{name:'result',strict:true,schema}}};
 await writeFile(`benchmark-data/exams/requests/${id}.json`,JSON.stringify({case:id,body}));
}
await writeFile('benchmark-data/exams/runs/request-provenance.json',JSON.stringify({prompt:match[1],schema,appSourceSha256:createHash('sha256').update(source).digest('hex'),note:'Same app prompt, schema, max_tokens and browser-prepared images. Primary accuracy calls use a common 60s deadline after a separately logged 15s timeout pilot. Report whether each response arrived within the app 15s per-attempt deadline; automatic model fallback and schema repair excluded to isolate models. Guards checked after capture; no DB writes.'},null,2));
