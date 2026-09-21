// Single model call. Used unchanged by OrcaReplay record/fork. Never loads app credentials or DB.
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const request=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const ledgerPath=process.env.EXAM_BENCH_LEDGER;
if(!ledgerPath||!process.env.OPENAI_API_KEY)throw Error('Benchmark environment missing');
const ledger=JSON.parse(await fs.readFile(ledgerPath,'utf8'));
if(ledger.ceiling!==2||ledger.committed+0.25>ledger.ceiling)throw Error('Budget guard: insufficient reserve');
// Reserve before the network request; unknown or interrupted costs retain the reserve.
ledger.committed+=0.25;await fs.writeFile(ledgerPath,JSON.stringify(ledger));
const start=Date.now(), id=randomUUID();
const record={id,case:request.case,requestedModel:request.body.model,startedAt:new Date().toISOString(),requestSha256:createHash('sha256').update(JSON.stringify(request.body)).digest('hex'),maxTokens:request.body.max_tokens,timeoutMs:60000,costUsd:null};
let success=false;
try{
 const r=await fetch(process.env.OPENAI_BASE_URL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json','X-OrcaRouter-Include-Cost':'true'},body:JSON.stringify(request.body),signal:AbortSignal.timeout(60000)});
 record.httpStatus=r.status;record.requestId=r.headers.get('x-orca-request-id');record.resolvedHeader=r.headers.get('x-orca-resolved-model');
 const data=await r.json();record.data=data;record.resolvedModel=record.resolvedHeader??data.model??null;
 const cost=data.usage?.cost_usd;
 if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){record.costUsd=cost;ledger.committed+=cost-0.25;ledger.observed+=cost;}
 record.status=r.ok?'response':'http_error';success=r.ok;
}catch(error){record.status='error';record.errorType=error.name;record.errorMessage=String(error.message).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]');}
record.elapsedMs=Date.now()-start;
ledger.calls+=1;if(record.costUsd===null)ledger.unknown+=1;
await fs.writeFile(ledgerPath,JSON.stringify(ledger));
await fs.writeFile(process.env.EXAM_BENCH_RESULTS+'/'+id+'.json',JSON.stringify(record,null,2));
console.error(JSON.stringify({case:record.case,resolvedModel:record.resolvedModel,status:record.status,ms:record.elapsedMs,costUsd:record.costUsd,committed:ledger.committed}));
process.exitCode=success?0:1;
