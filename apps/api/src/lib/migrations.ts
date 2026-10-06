// The migrations this build was written against (issue #342). Production once ran new code
// for two hours without six of them: the scheduler failed on a missing column and only the
// half-hourly health probe noticed. `/v1/health` now names any of these the database lacks,
// so the next deploy without its migrations turns the probe red on its first run.
//
// One line per file in infra/supabase/migrations; `migrations.test.ts` fails when a file is
// added without its line here (or the other way round).

import type { Db } from './db.js';

export const EXPECTED_MIGRATIONS: readonly string[] = [
  '0001_baseline',
  '0002_scheduler',
  '0003_learning_modes',
  '0004_voice',
  '0005_test_mode',
  '0006_item_flags',
  '0007_events',
  '0008_item_hints',
  '0009_material_pages',
  '0010_stable_order',
  '0011_material_parts',
  '0012_item_answer_rules',
  '0014_attempt_counters',
  '0016_erasure',
  '0017_fk_indexes',
  '0018_push_device_binding',
  '0020_buddy_safeguarding_and_delivery',
  '0022_revoke_app_key_access',
  '0024_session_lifecycle',
  '0028_scan_indexes',
  '0029_drop_material_language',
  '0032_contact_without_caps',
  '0033_pin_lock_without_escalation',
  '0034_stopped_turn',
  '0035_material_read_stage',
  '0036_reexplain',
  '0038_buddy_lookbacks',
  '0039_notification_actions',
  '0040_natural_voice',
  '0042_material_pdf',
  '0043_prepared_hints_used',
  '0044_shared_speech_cache',
  '0045_two_more_voices',
  '0046_touch_function_search_path',
  '0047_material_send_requested',
  '0048_session_summaries',
  '0049_self_consent',
  '0050_concept_images',
  '0051_consent_confirmed',
  '0052_cached_tokens',
  '0053_memory_consolidation',
  '0054_hybrid_search',
  '0056_material_failed_at',
  '0057_repeating_steps',
  '0058_recall_disposition',
  '0059_items_incomplete',
  '0060_pending_confirmations',
  '0061_answered_by',
  '0062_disputed_verdicts',
  '0063_focus',
  '0064_fraction_bar_tasks',
  '0065_state_before_two_kinds_of_empty',
  '0066_offer_cannot_start',
  '0067_not_practicable_forms',
  '0068_curriculum_region',
  '0069_flashcards',
  '0070_unclear_spots',
  '0072_answers_with_several_parts',
  '0073_items_still_coming',
  '0074_curriculum_point',
  '0075_writing_rubric',
  '0077_listening_tasks',
  '0078_staff_tasks',
  '0079_structured_items',
  '0080_choice_figures',
  '0081_spelling_dictation',
  '0082_drill_rounds',
  '0083_test_time_limit',
  '0084_roleplays',
  '0085_select_all_items',
  '0086_reading_passages',
  '0087_mark_items',
  '0088_teach_back_points',
  '0089_essay_feedback',
  '0090_practice_later',
  '0091_roleplay_feedback_message',
  '0092_tap_items',
  '0093_material_sources',
  '0094_find_error_column_calc',
  '0095_grid_items',
  '0098_item_why',
  '0099_essay_turn_text',
  '0101_worked_steps',
];

/**
 * The expected migrations the database has not recorded, or null where nothing records them
 * (the test and dev databases are built from the files directly and have no Supabase
 * migration table — there is nothing to compare, and that must not read as a failure).
 */
export async function missingMigrations(db: Db): Promise<string[] | null> {
  // Looked up in the catalog, which every role may read: `to_regclass` would need usage on
  // the schema. Without the read grant (infra/supabase/templates/api-role.sql) there is
  // nothing to compare either — an ungranted role must not take the whole API down as unhealthy.
  const table = await db.maybeOne<{ readable: boolean }>(
    `select has_table_privilege(c.oid, 'select') as readable
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations'`,
  );
  if (!table?.readable) return null;
  const rows = await db.query<{ name: string }>(
    `select name from supabase_migrations.schema_migrations`,
  );
  const applied = new Set(rows.map((r) => r.name));
  return EXPECTED_MIGRATIONS.filter((m) => !applied.has(m));
}
