import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {examExtractionSchema,examExtractionMessages,EXAM_EXTRACTION_MAX_TOKENS} from './structured-extraction';
let previous: string[] = [];
try { previous = await readdir('benchmark-data/exams/runs-structured-v2/responses'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
if (previous.length) throw new Error('Results already exist. Preserve this protocol; use a new version/directory for another experiment.');
const schema=z.toJSONSchema(examExtractionSchema,{io:'output'});
await mkdir('benchmark-data/exams/requests-structured-v2',{recursive:true});
await mkdir('benchmark-data/exams/runs-structured-v2',{recursive:true});
await mkdir('benchmark-data/exams/work-structured-v2',{recursive:true});
for(const group of ['A','B','C'])for(const condition of ['scan','clear','shadow']){
 const id=`${group}_${condition}`;
 const images=JSON.parse(await readFile(`benchmark-data/exams/normalized/${id}.json`,'utf8'));
 if(images.length!==1)throw Error('Primary benchmark expects one page per case');
 const body={model:'google/gemini-2.5-flash-lite',messages:examExtractionMessages(images[0]),max_tokens:EXAM_EXTRACTION_MAX_TOKENS,response_format:{type:'json_schema',json_schema:{name:'result',strict:true,schema}}};
 await writeFile(`benchmark-data/exams/requests-structured-v2/${id}.json`,JSON.stringify({case:id,body}));
}
const source=await readFile('scripts/benchmarks/structured-extraction.ts','utf8');
await writeFile('benchmark-data/exams/runs-structured-v2/protocol.json',JSON.stringify({version:'structured-v2',createdAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(source).digest('hex'),models:['google/gemini-2.5-flash-lite','google/gemini-2.5-flash'],cases:9,maxTokens:EXAM_EXTRACTION_MAX_TOKENS,timeoutMs:60000,reference:'../reference.json',sharedLedger:'../runs/ledger.json',note:'Same normalized images and user-approved truth. Change: extraction-only typed rows plus deterministic profile suggestions; output ceiling raised 6000->10000. Full individualized learning plan is a downstream existing job, not measured in either benchmark. Common 60s single attempt, no fallback or repair. Primary metric same 450 facts per model; retain baseline unchanged. First A_scan and C_scan pilot count toward primary if protocol unchanged. No prompt changes based on main results; failed cases retained.'},null,2));
console.log('Prepared nine v2 requests; no external calls.');
