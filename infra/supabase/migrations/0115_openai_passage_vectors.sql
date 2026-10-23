-- #893: model identity belongs to each vector, even across same-dimensional replacements.
-- Existing legacy vectors deliberately remain unlabelled: their historical model cannot be
-- inferred from dimensionality. Catch-up/backfill regenerates them before semantic use.
alter table material_passages
  add column embedding_model text,
  add column embedding_dimensions integer check (embedding_dimensions = 768),
  add column embedding_openai_model text,
  add column embedding_openai_dimensions integer check (embedding_openai_dimensions = 1536),
  add constraint passage_embedding_identity check ((embedding_model is null) = (embedding_dimensions is null)),
  add constraint passage_openai_identity check ((embedding_openai_model is null) = (embedding_openai_dimensions is null));

-- #893: additive index. The 768d index remains readable throughout backfill. Rollback requires filling the old space first.
-- The two embedding spaces must never be compared or written into each other's column.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table material_passages add column embedding_openai vector(1536)';
    execute 'create index material_passages_openai_idx on material_passages
      using hnsw (embedding_openai vector_cosine_ops) where embedding_openai is not null';
  end if;
end $$;
