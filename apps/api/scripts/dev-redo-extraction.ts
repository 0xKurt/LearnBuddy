// Dev-only: re-trigger AI extraction for all of a learner's materials
// WITHOUT making them re-take photos. Soft-archives the existing
// LLM-generated `items`, clears extracted_markdown, flips the
// material to extraction_status='failed' so the mobile UI shows the
// retry banner, and (optionally) immediately enqueues a fresh
// extraction_jobs row so the worker picks it up on the next drain.
//
// Run:
//   pnpm -F @learnbuddy/api dev:redo-extraction
//       → operates on every active learner's materials
//   pnpm -F @learnbuddy/api dev:redo-extraction your@email.com
//       → operates on the learner of that account only
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local. No
// migration changes, no schema touching — purely soft-resets the
// extraction state for existing materials.

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.local');
    process.exit(2);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const emailFilter = process.argv[2]?.toLowerCase();

  // 1. Find the learner(s) to touch.
  let learnerQuery = supabase
    .from('learners')
    .select('id, display_name, account_id')
    .is('archived_at', null);
  if (emailFilter) {
    // Look up the account id by email, then filter learners.
    const accountRes = await supabase
      .from('accounts')
      .select('id, owner_email')
      .eq('owner_email', emailFilter)
      .maybeSingle();
    if (!accountRes.data) {
      console.error(`No account found with email ${emailFilter}`);
      process.exit(2);
    }
    learnerQuery = learnerQuery.eq('account_id', accountRes.data.id);
  }
  const learnersRes = await learnerQuery;
  if (learnersRes.error) {
    console.error('Failed to load learners:', learnersRes.error.message);
    process.exit(2);
  }
  const learners = (learnersRes.data ?? []) as Array<{
    id: string;
    display_name: string;
    account_id: string;
  }>;
  console.log(`\nLearners in scope: ${learners.length}`);
  for (const l of learners) console.log(`  - ${l.display_name} (${l.id})`);

  if (learners.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  // 2. For each learner, list every active material with photos.
  const totals = { materials: 0, itemsArchived: 0, jobsEnqueued: 0 };
  for (const learner of learners) {
    const matsRes = await supabase
      .from('materials')
      .select('id, title, extraction_status, page_count')
      .eq('learner_id', learner.id)
      .is('archived_at', null);
    if (matsRes.error) {
      console.error(`  ✗ load materials failed for ${learner.id}: ${matsRes.error.message}`);
      continue;
    }
    const materials = (matsRes.data ?? []) as Array<{
      id: string;
      title: string | null;
      extraction_status: string;
      page_count: number | null;
    }>;
    console.log(`\nLearner ${learner.display_name}: ${materials.length} active materials`);

    for (const mat of materials) {
      console.log(
        `  · ${mat.id}  "${mat.title ?? '(untitled)'}"  status=${mat.extraction_status}  pages=${mat.page_count}`,
      );

      // 2a. Soft-archive existing items.
      const archiveRes = await supabase
        .from('items')
        .update({ archived_at: new Date().toISOString() })
        .eq('material_id', mat.id)
        .is('archived_at', null);
      if (archiveRes.error) {
        console.error(`    ✗ archive items: ${archiveRes.error.message}`);
        continue;
      }
      // Count affected items.
      const archivedCountRes = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('material_id', mat.id);
      const archivedCount = archivedCountRes.count ?? 0;

      // 2b. Reset material to a re-extractable state.
      const updateRes = await supabase
        .from('materials')
        .update({
          extraction_status: 'failed',
          extraction_error: 'dev: re-extract requested',
          extracted_markdown: null,
          detected_language: null,
          extraction_model: null,
          extraction_prompt_version: null,
        })
        .eq('id', mat.id);
      if (updateRes.error) {
        console.error(`    ✗ reset material: ${updateRes.error.message}`);
        continue;
      }

      // 2c. Remove any leftover extraction_jobs rows for this material
      // so the retry path can enqueue cleanly.
      await supabase.from('extraction_jobs').delete().eq('material_id', mat.id);

      console.log(`    ✓ archived ${archivedCount} items, reset material to retry-ready`);
      totals.materials += 1;
      totals.itemsArchived += archivedCount;
    }
  }

  console.log(
    `\n══════════════════════════════════════════════════════════════` +
      `\nDone: ${totals.materials} materials reset · ${totals.itemsArchived} items archived` +
      `\nOpen the mobile app — every material now shows the "Nicht lesbar" banner with a retry button.` +
      `\nTap "Nochmal versuchen" on each one (or use the bulk retry if you wire it later) — the existing retryMaterial route synthesises fresh extraction_jobs from the photos and the worker picks them up.` +
      `\n══════════════════════════════════════════════════════════════`,
  );
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
