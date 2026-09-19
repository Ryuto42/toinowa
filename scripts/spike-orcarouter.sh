#!/usr/bin/env bash
# M0 スパイク: OrcaRouter の実挙動を実測する。
# 無料枠は 10 req/分・50 req/日なので、合計4リクエストに抑えている。
set -uo pipefail
set -a; . ./.env.local; set +a
B="$ORCAROUTER_BASE_URL"; K="$ORCAROUTER_API_KEY"
H=/tmp/orca_h.txt

hdr() { grep -i "^$1:" "$H" | tr -d '\r' | head -1; }

echo "════ spike 2+3: orcarouter/free + コスト・ヘッダ ════"
curl -sS -D "$H" -o /tmp/orca_b.json --max-time 60 "$B/chat/completions" \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -H "X-OrcaRouter-Include-Cost: true" \
  -d '{"model":"orcarouter/free","max_tokens":20,"messages":[{"role":"user","content":"1+1は? 数字だけ答えて"}]}'
echo "HTTP: $(head -1 "$H" | tr -d '\r')"
for h in x-orca-resolved-model x-orca-router x-orca-fallback-level x-orca-fallback-model x-orca-request-id; do
  echo "  $(hdr $h)"
done
echo "  usage: $(node -e 'const j=require("/tmp/orca_b.json");console.log(JSON.stringify(j.usage??j.error??j))' 2>/dev/null)"
echo "  content: $(node -e 'const j=require("/tmp/orca_b.json");console.log(JSON.stringify(j.choices?.[0]?.message?.content))' 2>/dev/null)"

echo
echo "════ spike 4a: response_format json_schema (strict) ════"
curl -sS -D "$H" -o /tmp/orca_s.json --max-time 60 "$B/chat/completions" \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -H "X-OrcaRouter-Include-Cost: true" \
  -d '{"model":"orcarouter/free","max_tokens":200,
       "messages":[{"role":"user","content":"生徒の解答「y=2x+3 の傾きは3」を採点して。"}],
       "response_format":{"type":"json_schema","json_schema":{"name":"grade","strict":true,
         "schema":{"type":"object","additionalProperties":false,
           "properties":{"correct":{"type":"boolean"},"misconception":{"type":"string"}},
           "required":["correct","misconception"]}}}}'
echo "HTTP: $(head -1 "$H" | tr -d '\r') / resolved: $(hdr x-orca-resolved-model)"
node -e 'const j=require("/tmp/orca_s.json");console.log("  ",JSON.stringify(j.error??j.choices?.[0]?.message?.content))' 2>/dev/null

echo
echo "════ spike 4b: tool-calling (単一必須ツール) ════"
curl -sS -D "$H" -o /tmp/orca_t.json --max-time 60 "$B/chat/completions" \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"model":"orcarouter/free","max_tokens":200,
       "messages":[{"role":"user","content":"生徒の解答「y=2x+3 の傾きは3」を採点して。"}],
       "tools":[{"type":"function","function":{"name":"emit_result","description":"採点結果を返す",
         "parameters":{"type":"object","additionalProperties":false,
           "properties":{"correct":{"type":"boolean"},"misconception":{"type":"string"}},
           "required":["correct","misconception"]}}}],
       "tool_choice":{"type":"function","function":{"name":"emit_result"}}}'
echo "HTTP: $(head -1 "$H" | tr -d '\r') / resolved: $(hdr x-orca-resolved-model)"
node -e 'const j=require("/tmp/orca_t.json");const m=j.choices?.[0]?.message;console.log("  ",JSON.stringify(j.error??m?.tool_calls?.[0]?.function??m?.content))' 2>/dev/null

echo
echo "════ spike 5: /v1/embeddings ════"
curl -sS -D "$H" -o /tmp/orca_e.json --max-time 60 "$B/embeddings" \
  -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"model":"openai/text-embedding-3-small","input":"一次関数の傾き"}'
echo "HTTP: $(head -1 "$H" | tr -d '\r')"
node -e 'const j=require("/tmp/orca_e.json");const d=j.data?.[0]?.embedding;console.log("  ",d?`OK dims=${d.length} model=${j.model}`:JSON.stringify(j.error??j).slice(0,300))' 2>/dev/null
