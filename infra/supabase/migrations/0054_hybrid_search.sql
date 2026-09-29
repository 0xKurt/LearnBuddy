-- Hybrid-Suche für Material-Passagen (issues #23, #26). tsvector zerlegt deutsche
-- Komposita nicht („Malaufgaben" findet „Multiplikation" nicht) und Kinder vertippen
-- sich; Embeddings ergänzen die Volltextsuche, sie ersetzen sie nicht. Drei Wege,
-- per Reciprocal-Rank-Fusion in Code zusammengeführt (connectors/material.ts):
--   1. Volltext über materials.extracted_text (bestehender Weg, unverändert),
--   2. pg_trgm-Wortähnlichkeit über Passagen (Vertipper: „Fotosyntese"),
--   3. pgvector-Kosinus über gemini-embedding-001@768d-Passagen-Embeddings (Semantik:
--      „Bruchrechnung" ≈ „Brüche erweitern und kürzen").
-- Der Verlierer einer fehlenden Komponente ist immer nur ihre eigene Liste: ohne
-- pgvector (lokales PG14) oder ohne Embedding-Budget läuft die Suche als FTS+Trigramm.
--
-- Memories bekommen KEINE Embeddings: alle aktiven Memories (Kappe 60, Konsolidierung
-- ab 45, migration 0053) stehen vollständig im STATE-Block jedes Model-Calls — es gibt
-- keinen Memory-Lookup, den eine Suche verbessern könnte. Erst wenn Memories je aus
-- dem Kontext fallen, braucht es hier eine zweite Tabelle.
--
-- Aufbewahrung: Passagen und ihre Embeddings sind abgeleiteter Lerninhalt wie
-- extracted_text (docs/privacy.md §What is stored) — sie leben, bis das Material oder
-- das Konto gelöscht wird (on delete cascade; Löschjob räumt sie vor materials).

-- Vertipper-Suche. pg_trgm liegt lokal (Homebrew PG14) wie auf Supabase bei.
create extension if not exists pg_trgm;

-- pgvector: auf Supabase VERFÜGBAR, aber nicht von selbst AKTIV — `create extension`
-- ist also nötig. Geprüft wird gegen pg_available_extensions, denn der lokale
-- Test-Postgres (PG14, Homebrew) hat pgvector nicht: dort entsteht das Schema ohne
-- Embedding-Spalte, Code und Tests erkennen das zur Laufzeit (materialEmbeddingsReady)
-- und lassen die Vektor-Liste ehrlich weg statt zu raten.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    execute 'create extension if not exists vector';
  end if;
end;
$$;

-- Eine Zeile pro Passage eines gelesenen Blatts (modules/materials/passages.ts
-- zerlegt extracted_text an Absatzgrenzen, ~200–700 Zeichen). Das Embedding kommt
-- asynchron nach dem Lesen (oder beim nächsten Suchlauf) dazu; null heißt „noch
-- nicht eingebettet", nie „kein Inhalt".
create table material_passages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  position smallint not null check (position between 0 and 199),
  text text not null check (length(text) between 1 and 2000),
  tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  created_at timestamptz not null default now(),
  unique (material_id, position)
);
-- Every foreign key carries its index, so deleting an account never scans the table
-- (src/__tests__/scale.int.test.ts). material_id steckt im Unique-Index.
create index material_passages_learner_idx on material_passages(learner_id);
create index material_passages_tsv_idx on material_passages using gin(tsv);
create index material_passages_trgm_idx on material_passages using gin(text gin_trgm_ops);
alter table material_passages enable row level security;

-- Embedding-Spalte und -Index nur, wo pgvector aktiv ist (dynamisch, weil der Typ
-- `vector` sonst schon beim Parsen fehlschlüge). 768 Dimensionen: gemini-embedding-001
-- mit outputDimensionality 768, in Code auf Länge 1 normalisiert (die API liefert
-- bei 768d unnormalisierte Vektoren — live gemessen 2026-09-29, Norm ≈ 0.586).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table material_passages add column embedding vector(768)';
    execute 'create index material_passages_embedding_idx on material_passages
               using hnsw (embedding vector_cosine_ops)';
  end if;
end;
$$;

-- Embeddings sind eigene budgetierte Model-Calls (config.ts DAILY_LIMITS,
-- docs/architecture.md §Limits): ein purpose 'embedding' für Indexieren und Anfragen.
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary','figures','consolidate',
                  'embedding'));
