import json,csv,statistics
from pathlib import Path
base=Path('benchmark-data/exams/runs')
scores=json.loads((base/'scores.json').read_text())['scored']; fields=list(csv.DictReader((base/'field-scores.csv').open()))
models=['gemini-2.5-flash','gemini-2.5-flash-lite','gpt-4o-mini-2024-07-18']
core_a={'raw/'+s for s in ['英語','リスニング','数学①（数学IA）','数学②（数学IIB）','国語','物理','化学','地理B']}
core_b={'raw/'+s for s in ['国語','数学計','数学B','英語','物理','化学']}
out={}
for model in models:
 a=[s for s in scores if s['model']==model and '_r' not in s['case']]
 core=[f for f in fields if f['model']==model and '_r' not in f['case'] and ((f['case'][0]=='A' and f['row'] in core_a) or(f['case'][0]=='B' and f['row'] in core_b) or(f['case'][0]=='C' and f['field'] in ['score','max']))]
 metrics={k:sum(r[k] for r in a) for k in ['correct','wrong','missing','ambiguous','unusable','total','costUsd','within15s','schemaAndGuardsPass','allTargetFieldsMatch']}
 metrics.update(n=len(a),meanMs=statistics.mean(r['elapsedMs'] for r in a),medianMs=statistics.median(r['elapsedMs'] for r in a),coreCorrect=sum(f['status']=='correct' for f in core),coreTotal=len(core))
 metrics['pages']={p:{'correct':sum(r['correct'] for r in a if r['case'][0]==p),'total':sum(r['total'] for r in a if r['case'][0]==p)} for p in 'ABC'}
 out[model]=metrics
(base/'aggregate.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False,indent=2))
