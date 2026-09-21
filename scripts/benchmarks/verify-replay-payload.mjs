// Offline upstream stub: verify that OrcaReplay changes only model, not images or schema.
import {createProxy} from '../../benchmark-data/orcareplay/node_modules/@orcareplay/proxy/dist/server.js';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const protocol=process.env.EXAM_BENCH_PROTOCOL??'baseline';
if(!['baseline','structured-v2'].includes(protocol))throw Error('Unknown benchmark protocol');
const suffix=protocol==='baseline'?'':'-'+protocol;
const {body}=JSON.parse(await fs.readFile(`benchmark-data/exams/requests${suffix}/A_scan.json`,'utf8'));const records=[];
for(const model of [body.model,'google/gemini-2.5-flash',...(protocol==='baseline'?['openai/gpt-4o-mini']:[])]){
 let sent;const proxy=await createProxy({mode:'record',forkModel:model===body.model?undefined:model,upstream:{openai:'https://api.orcarouter.ai'},fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({id:'offline-test',model,choices:[{message:{role:'assistant',content:'{}'},finish_reason:'stop'}],usage:{prompt_tokens:0,completion_tokens:0}}),{headers:{'content-type':'application/json'}});}});
 try{const r=await fetch(proxy.url+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await r.text();assert.deepEqual(sent,{...body,model});records.push({model,exactExceptModel:true,imageSha256:createHash('sha256').update(sent.messages[1].content[0].image_url.url).digest('hex')});}finally{await proxy.close();}
}
await fs.writeFile(`benchmark-data/exams/runs${suffix}/replay-payload-check.json`,JSON.stringify({orcareplay:'0.4.0',method:'Actual proxy with offline upstream stub; no external API calls',records},null,2));console.log(records);
