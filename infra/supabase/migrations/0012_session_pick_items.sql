-- 0012 — Server-side session item picker.
-- Source: docs/04-api.md §sessions + docs/05-mobile.md §adaptive-review.
--
-- Replaces the load-all-then-sort-in-JS path in routes/sessions.ts with a
-- single Postgres query that uses the item_states_learner_due_idx covering
-- index. Avoids a 3–5 MB read for power users with thousands of items.
--
-- Sorting buckets (mirrors the JS fallback):
--   0 — overdue (due < now)
--   1 — new     (no item_state row yet)
--   2 — future  (due >= now)
-- Within each bucket, sort by due ASC so the most overdue / earliest-future
-- items come first.
--
-- When a folder_id bias is requested (Klassenarbeit folder), items belonging
-- to that folder are promoted within each bucket before unbiased items.

create or replace function lb_pick_session_items(
  p_learner_id  uuid,
  p_subject_id  uuid    default null,
  p_folder_id   uuid    default null,
  p_material_id uuid    default null,
  p_max_items   int     default 20,
  p_now         timestamptz default now()
)
returns table (item_id uuid)
language sql stable
security definer
as $$
  with
  -- All non-archived items for this learner, optionally scoped.
  scoped_items as (
    select i.id as item_id, i.material_id
    from   items i
    where  i.learner_id     = p_learner_id
      and  i.archived_at    is null
      and  (p_material_id   is null or i.material_id = p_material_id)
  ),
  -- When filtering by subject or folder, resolve the material IDs first.
  allowed_materials as (
    select m.id
    from   materials m
    where  m.learner_id   = p_learner_id
      and  m.archived_at  is null
      and  (p_subject_id  is null or m.subject_id = p_subject_id)
      and  (p_folder_id   is null or m.folder_id  = p_folder_id)
  ),
  -- Join items to their (optional) FSRS state.
  items_with_state as (
    select
      s.item_id,
      s.material_id,
      st.due,
      case
        when st.due     is null             then 1   -- new (no state yet)
        when st.due < p_now                 then 0   -- overdue
        else                                     2   -- future
      end as bucket,
      st.due as sort_key
    from   scoped_items s
    left   join item_states st on st.item_id = s.item_id
    where  (p_subject_id is null and p_folder_id is null)
        or s.material_id in (select id from allowed_materials)
  ),
  -- Folder-bias: items from p_folder_id come first within each bucket.
  biased as (
    select
      iws.item_id,
      iws.bucket,
      iws.sort_key,
      case
        when p_folder_id is not null
             and iws.material_id in (select id from allowed_materials) then 0
        else 1
      end as bias
    from items_with_state iws
  )
  select item_id
  from   biased
  order  by bucket asc, bias asc, sort_key asc nulls last
  limit  p_max_items;
$$;

-- Grant execute to the service-role (the API uses the service-role client).
grant execute on function lb_pick_session_items(uuid, uuid, uuid, uuid, int, timestamptz)
  to service_role;
