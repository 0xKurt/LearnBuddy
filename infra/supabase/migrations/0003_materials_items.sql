-- 0003 — Materials, photos, study assets, items.
-- Source: docs/03-data-model.md §materials-and-items.

create table materials (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  learner_id uuid not null references learners(id) on delete cascade,
  title text,
  source_kind text not null default 'photo'
    check (source_kind in ('photo','text','pdf')),
  page_count smallint not null default 1,
  extracted_markdown text,
  detected_language text,
  extraction_model text,
  extraction_prompt_version text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','ready','failed')),
  extraction_error text,
  photos_deleted_at timestamptz,
  scheduled_photo_deletion_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materials_subject_idx on materials(subject_id) where archived_at is null;
create index materials_folder_idx on materials(folder_id) where archived_at is null;
create index materials_pending_extraction_idx on materials(created_at)
  where extraction_status = 'pending';
create index materials_photo_wipe_due_idx on materials(scheduled_photo_deletion_at)
  where photos_deleted_at is null and scheduled_photo_deletion_at is not null;

create trigger materials_updated_at
  before update on materials
  for each row execute function lb_set_updated_at();

alter table materials enable row level security;
create policy material_account_rw on materials
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table material_photos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  position smallint not null,
  storage_path text not null,
  width int,
  height int,
  byte_size int,
  client_blur_score real,
  client_brightness real,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index material_photos_pos_idx on material_photos(material_id, position);

alter table material_photos enable row level security;
create policy material_photo_account_rw on material_photos
  for all using (
    material_id in (
      select m.id from materials m
      join learners k on k.id = m.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    material_id in (
      select m.id from materials m
      join learners k on k.id = m.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table study_assets (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  kind text not null check (kind in ('numbered_diagram','cropped_graph','rendered_formula','clean_image')),
  storage_path text not null,
  source_page_index smallint,
  title text,
  width int not null,
  height int not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index study_assets_material_idx on study_assets(material_id);
create index study_assets_learner_idx on study_assets(learner_id);

alter table study_assets enable row level security;
create policy study_asset_account_rw on study_assets
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table items (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,

  question text not null,
  expected_answer text not null,
  acceptable_answers text[] not null default '{}',
  answer_kind text not null default 'short'
    check (answer_kind in ('short','long','numeric','multiple_choice','formula','diagram_label','fill_blank')),

  mc_options text[],
  mc_correct_index smallint,
  mc_option_stimuli jsonb,

  units text,
  latex_expected text,
  latex_acceptable text[] not null default '{}',

  fill_blank_template text,
  fill_blank_answers text[] not null default '{}',

  study_asset_id uuid references study_assets(id) on delete set null,
  diagram_label_index smallint,

  stimulus_kind text not null default 'none'
    check (stimulus_kind in ('none','study_asset','function_plot','svg','coord_grid')),
  stimulus_data jsonb not null default '{}',

  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  topic text,
  language text not null default 'de',
  source_excerpt text,
  generated_by_model text,
  generated_by_prompt_version text,
  -- problem_template_id FK closed in 0004.
  problem_template_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_material_idx on items(material_id) where archived_at is null;
create index items_learner_active_idx on items(learner_id) where archived_at is null;
create index items_topic_idx on items(learner_id, topic) where archived_at is null;
create index items_template_idx on items(problem_template_id) where problem_template_id is not null;

create trigger items_updated_at
  before update on items
  for each row execute function lb_set_updated_at();

alter table items enable row level security;
create policy items_account_rw on items
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
