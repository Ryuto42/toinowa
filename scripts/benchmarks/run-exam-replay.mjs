import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
const root=process.cwd(), require=createRequire(root+'/package.json');
const env=require('dotenv').parse(await fs.readFile('.env.benchmark.local'));
if(Number(env.BENCHMARK_MAX_COST_USD)!==2||!env.BENCHMARK_ORCAROUTER_API_KEY)throw Error('Expected approved $2 benchmark configuration');
const protocol=process.env.EXAM_BENCH_PROTOCOL??'baseline';
if(!['baseline','structured-v2','evidence-v3'].includes(protocol))throw Error('Unknown benchmark protocol');
const suffix=protocol==='baseline'?'':'-'+protocol;
const retry=process.env.EXAM_BENCH_RETRY==='1';
if(retry&&(protocol!=='structured-v2'||process.argv[2]!=='compare'))throw Error('Retry is a separate structured-v2 comparison only');
const results=path.join(root,'benchmark-data/exams/runs'+suffix+(retry?'/responses-retry':'/responses'));await fs.mkdir(results,{recursive:true});
const ledger=path.join(root,'benchmark-data/exams/runs/ledger.json');
try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({ceiling:2,committed:0,observed:0,calls:0,unknown:0}));}
const childEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,OPENAI_API_KEY:env.BENCHMARK_ORCAROUTER_API_KEY,EXAM_BENCH_LEDGER:ledger,EXAM_BENCH_RESULTS:results};
const cli=path.join(root,'benchmark-data/orcareplay/node_modules/orcareplay/dist/cli.js');const work=path.join(root,'benchmark-data/exams/work'+suffix);
async function run(args,file){return await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[cli,...args],{cwd:work,env:childEnv,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>{err+=d;});p.on('error',reject);p.on('close',async code=>{const safe=(s)=>s.split(env.BENCHMARK_ORCAROUTER_API_KEY).join('[redacted]');await fs.writeFile(path.join(root,'benchmark-data/exams/runs'+suffix+'/'+file+'.json'),safe(out));await fs.writeFile(path.join(root,'benchmark-data/exams/runs'+suffix+'/'+file+'.log'),safe(err));console.log(safe(err.slice(-3000)));console.log('exit',code);resolve({code,out});});});}
const mode=process.argv[2]??'record';const id=process.argv[3]??'A_scan';
if(protocol!=='baseline'){
 const artifact=id+(mode==='record'?'-record':retry?'-retry-compare':'-compare');
 let exists=false;
 try{await fs.access(path.join(root,'benchmark-data/exams/runs'+suffix+'/'+artifact+'.json'));exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(exists)throw Error('Preserve existing trial '+artifact+'; do not overwrite a measured result');
}
if(mode==='record'){
 const req=path.join(root,'benchmark-data/exams/requests'+suffix+'/'+id+'.json');
 await run(['record','generic-openai','--no-shell','--no-agent-spans','--upstream-openai','https://api.orcarouter.ai','--json','--',process.execPath,path.join(root,'scripts/benchmarks/exam-worker.mjs'),req],id+'-record');
}else if(mode==='compare'){
 await run(['compare',process.argv[4]??'last','--from','1','--models',protocol==='baseline'?'google/gemini-2.5-flash,openai/gpt-4o-mini':protocol==='evidence-v3'?'google/gemini-2.5-pro':'google/gemini-2.5-flash','--no-fs','--upstream-openai','https://api.orcarouter.ai','--json'],id+(retry?'-retry-compare':'-compare'));
}else await run([mode,process.argv[4]??'last','--json'],id+'-'+mode);
console.log('ledger',await fs.readFile(ledger,'utf8'));
