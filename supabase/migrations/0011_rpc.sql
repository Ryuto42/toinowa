-- アプリから呼ぶRPC。いずれも service role 経由でのみ使う。

-- 教材チャンク検索。
--
-- 設計の要点: lesson_id / concept_id で **先に絞ってから** ベクトル距離を取る。
-- 会話の文脈からこの2つはほぼ常に分かるので、対象は数十チャンクに収まる。
-- 全コーパスを舐めないので速く・安く、HNSWの再現率も問題にならない。
--
-- 埋め込みが無い環境（embedding is null）でも落ちないよう、
-- ベクトル検索は embedding が入っている行だけを対象にする。
--
-- `OPERATOR(public.<=>)` と書いているのは、`set search_path = ''` を保ったまま
-- pgvector の演算子を解決するため。search_path を緩めるほうが楽だが、
-- SECURITY まわりの関数と書き方を揃えておきたいのでこちらにする。
create or replace function match_material_chunks(
  p_tenant         uuid,
  p_embedding      vector(1536),
  p_lesson         uuid default null,
  p_concept        uuid default null,
  p_limit          int default 6,
  p_min_similarity float default 0.35
)
returns table (
  id uuid, material_id uuid, content text, chunk_index int, similarity float
)
language sql stable
set search_path = ''
as $$
  select c.id, c.material_id, c.content, c.chunk_index,
         1 - (c.embedding OPERATOR(public.<=>) p_embedding) as similarity
  from public.material_chunks c
  where c.tenant_id = p_tenant
    and c.embedding is not null
    and not c.quarantined                                -- 攻撃検知済みチャンクは返さない
    and (p_lesson  is null or c.lesson_id = p_lesson)
    and (p_concept is null or c.concept_ids @> array[p_concept])
    and 1 - (c.embedding OPERATOR(public.<=>) p_embedding) >= p_min_similarity
  order by c.embedding OPERATOR(public.<=>) p_embedding
  limit p_limit;
$$;
revoke all on function match_material_chunks(uuid, vector, uuid, uuid, int, float)
  from anon, authenticated;

-- 埋め込みが使えない場合の代替検索路（全文検索）。
-- 「教材が無い / 埋め込みが無い」状況でも概念スコープで根拠を返せるようにする。
create or replace function search_material_chunks_text(
  p_tenant  uuid,
  p_query   text,
  p_lesson  uuid default null,
  p_concept uuid default null,
  p_limit   int default 6
)
returns table (
  id uuid, material_id uuid, content text, chunk_index int, rank float
)
language sql stable
set search_path = ''
as $$
  select c.id, c.material_id, c.content, c.chunk_index,
         ts_rank(to_tsvector('simple', c.content),
                 plainto_tsquery('simple', p_query))::float as rank
  from public.material_chunks c
  where c.tenant_id = p_tenant
    and not c.quarantined
    and (p_lesson  is null or c.lesson_id = p_lesson)
    and (p_concept is null or c.concept_ids @> array[p_concept])
    and to_tsvector('simple', c.content) @@ plainto_tsquery('simple', p_query)
  order by rank desc
  limit p_limit;
$$;
revoke all on function search_material_chunks_text(uuid, text, uuid, uuid, int)
  from anon, authenticated;

-- 予算台帳への加算。呼び出しのたびに1行upsertする。
create or replace function bump_ai_budget(
  p_tenant uuid, p_scope text, p_scope_id uuid, p_cost numeric
)
returns void
language sql volatile
set search_path = ''
as $$
  insert into public.ai_budget_ledger (tenant_id, scope, scope_id, day, spent_usd, request_count)
  values (p_tenant, p_scope, p_scope_id, current_date, coalesce(p_cost, 0), 1)
  on conflict (scope, scope_id, day) do update
    set spent_usd     = public.ai_budget_ledger.spent_usd + coalesce(p_cost, 0),
        request_count = public.ai_budget_ledger.request_count + 1;
$$;
revoke all on function bump_ai_budget(uuid, text, uuid, numeric) from anon, authenticated;

-- 本日のテナント消費額。呼び出し「前」の予算チェックに使う。
-- 超過を発見したリクエストで課金しないための順序。
create or replace function today_ai_spend(p_tenant uuid)
returns numeric
language sql stable
set search_path = ''
as $$
  select coalesce(sum(spent_usd), 0)
  from public.ai_budget_ledger
  where tenant_id = p_tenant and scope = 'tenant' and day = current_date;
$$;
revoke all on function today_ai_spend(uuid) from anon, authenticated;
