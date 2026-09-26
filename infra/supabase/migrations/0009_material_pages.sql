-- Pages Buddy could not (fully) read (docs/architecture.md §Material).
--
-- When one sheet of several is cut off, blurred or dark, the others still
-- become questions, and Lena is told which page is missing so she can
-- photograph exactly that page again. Before, such a page was silently
-- dropped. One entry per page that was not read completely:
-- {"page": 2, "read": "part" | "none", "problem": "cut_off" | … | null}.
-- The notice ends when she sends the page again (a new material that
-- completes this one) or says it is fine ("Passt so").
alter table materials
  add column page_problems jsonb not null default '[]'
    check (jsonb_typeof(page_problems) = 'array'),
  add column pages_resolved_at timestamptz,
  add column completes_material_id uuid references materials(id) on delete set null;
