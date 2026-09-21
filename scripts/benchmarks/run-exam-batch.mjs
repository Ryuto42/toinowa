import {spawn} from 'node:child_process';import fs from 'node:fs/promises';
async function run(args){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/benchmarks/run-exam-replay.mjs',...args],{stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Runner failed '+code)));});}
const cases=process.argv.slice(2);if(!cases.length)throw Error('Specify case IDs explicitly');
for(const id of cases){
 await run(['record',id]);const meta=JSON.parse(await fs.readFile(`benchmark-data/exams/runs/${id}-record.json`,'utf8'));
 if(meta.exitCode!==0||meta.modelExchanges!==1)throw Error('Invalid seed '+id+'; stop for inspection');
 await run(['compare',id,meta.runId]);
 const compared=JSON.parse(await fs.readFile(`benchmark-data/exams/runs/${id}-compare.json`,'utf8'));
 if(compared.some(x=>x.exitCode!==0))throw Error('Incomplete comparison '+id+'; stop for inspection');
 console.log('CASE COMPLETE',id);
}
