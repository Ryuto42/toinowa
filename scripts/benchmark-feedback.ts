import { config } from 'dotenv';
import OpenAI from 'openai';
import { writeFile } from 'node:fs/promises';
config({ path: '.env.local', quiet: true });
async function main() {
  const client = new OpenAI({ apiKey: process.env.ORCAROUTER_API_KEY, baseURL: process.env.ORCAROUTER_BASE_URL ?? 'https://api.orcarouter.ai/v1', maxRetries: 0, timeout: 45000, defaultHeaders: { 'X-OrcaRouter-Include-Cost': 'true' } });
  const catalog = await client.models.list();
  const candidates = ['openai/gpt-5-nano', 'orcarouter/auto'];
  const cases = [
    { name: '正しい説明', text: '一次関数y=2x+3では、xが1増えるとyが2増えるので傾きは2です。xが0のときyは3なので切片は3です。基本料金3円に、1個につき2円加わる料金のように考えられます。', min: 0.7, max: 1 },
    { name: '誤概念を含む説明', text: '一次関数y=2x+3では、切片2がグラフの傾きを決めて、傾き3がx=0のときのyです。', min: 0, max: 0.5 },
  ];
  const results = [];
  let spent = 0;
  for (const model of candidates) {
    if (model !== 'orcarouter/auto' && !catalog.data.some(item => item.id === model)) { results.push({ requestedModel: model, error: 'not_in_catalog' }); continue; }
    for (const sample of cases) {
      if (spent >= 0.1) throw new Error('比較用費用上限に到達');
      const start = Date.now();
      try {
        const { data, response } = await client.chat.completions.create({ model, max_tokens: 2000, messages: [
          { role: 'system', content: '概念説明を評価してください。傾きと切片の意味の正確さ、具体例を評価し、根拠のない点は補完しないでください。JSONでscore(0〜1),misconceptions(文字列配列),feedback(短い日本語)のみを返してください。' },
          { role: 'user', content: sample.text },
        ], response_format: { type: 'json_object' } }).withResponse();
        const usage = data.usage as unknown as { cost_usd?: number; cost?: number; total_tokens?: number };
        const cost = Number(usage?.cost_usd ?? usage?.cost ?? 0); spent += cost;
        const raw = data.choices[0]?.message.content ?? '';
        let parsed: { score?: number; misconceptions?: string[] } = {};
        try { parsed = JSON.parse(raw); } catch { /* comparison records malformed output */ }
        const passed = typeof parsed.score === 'number' && parsed.score >= sample.min && parsed.score <= sample.max && (sample.max === 1 || Boolean(parsed.misconceptions?.length));
        results.push({ requestedModel: model, resolvedModel: response.headers.get('x-orca-resolved-model') ?? data.model, case: sample.name, elapsedMs: Date.now()-start, costUsd: cost, costReported: usage?.cost_usd !== undefined || usage?.cost !== undefined, tokens: usage?.total_tokens, passed, output: raw });
      } catch (error) { results.push({ requestedModel: model, case: sample.name, error: error instanceof Error ? error.message : 'failed' }); }
    }
  }
  const report = { measuredAt: new Date().toISOString(), note: '人工的な2例のスモーク比較。一般的な教育品質・採点一致率の証明ではない。直接比較のためアプリの利用台帳には含まれない。', results, totalCostUsd: spent };
  await writeFile('docs/data/feedback-model-evaluation.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
