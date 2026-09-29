-- Konzeptbilder (issue #50): echte Bild-Ausschnitte aus den fotografierten Seiten,
-- niemals generierte Bilder. Ein Vision-Pass (purpose 'figures') liefert je Seite enge
-- Boxen ganzer Lehr-Figuren; sharp schneidet aus und säubert leicht (Graustufen +
-- Kontrast); der Ausschnitt hängt an den Fragen, die er beantwortet hilft.
--
-- Aufbewahrung: Ausschnitte sind abgeleiteter Lerninhalt wie extracted_text — sie leben,
-- bis das Material oder die Frage gelöscht wird, NICHT nur 7 Tage wie die Rohfotos
-- (docs/privacy.md §What is stored). Der Purge-Pfad (modules/materials/purge.ts) räumt
-- sie aus Storage mit weg.

create table material_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  -- Objekt im privaten Bucket material-photos (eigener Name neben den Fotos, damit der
  -- Foto-Purge nach 7 Tagen ihn nie trifft: der löscht nur material_photos-Pfade).
  storage_path text not null,
  -- Kurzer, vom Modell geschriebener Name der Figur (accessibilityLabel in der App).
  label text not null default '' check (length(label) <= 160),
  width int not null default 0,
  height int not null default 0,
  created_at timestamptz not null default now()
);
-- Every foreign key carries its index, so deleting an account never scans the table
-- (src/__tests__/scale.int.test.ts).
create index material_images_material_idx on material_images(material_id);
create index material_images_learner_idx on material_images(learner_id);
alter table material_images enable row level security;

-- Die Frage zeigt höchstens einen Ausschnitt; mehrere Fragen teilen sich dieselbe Figur.
alter table items add column image_id uuid references material_images(id) on delete set null;
create index items_image_idx on items(image_id) where image_id is not null;

-- Der Vision-Pass ist ein eigener budgetierter Model-Call (config.ts DAILY_LIMITS).
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary','figures'));
