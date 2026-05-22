// Dev-only: re-trigger AI extraction for a learner's materials
// WITHOUT making them re-take photos. Soft-archives the existing
// LLM-generated `items`, clears extracted_markdown, flips the
// material to extraction_status='failed' so the mobile UI shows the
// retry banner. The existing retryMaterial route then enqueues a
// fresh extraction_jobs row from the photos and the worker re-runs.
//
// Run:
//   pnpm -F @learnbuddy/api dev:redo-extraction your@email.com
//       → operates on the learner of that account only
//   pnpm -F @learnbuddy/api dev:redo-extraction --all
//       → operates on every active learner. REQUIRES the explicit
//         --all flag so you can't wipe everyone by typo.
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
  const arg = process.argv[2]?.toLowerCase();
  if (!arg) {
    console.error(
      'Pass an email to target ONE account: pnpm -F @learnbuddy/api dev:redo-extraction your@email.com\n' +
        'Or pass --all to wipe extraction state across every learner (dangerous):\n' +
        '  pnpm -F @learnbuddy/api dev:redo-extraction --all',
    );
    process.exit(2);
  }
  const emailFilter = arg === '--all' ? null : arg;

  // 1. Find the learner(s) to touch.
  let learnerQuery = supabase
    .from('learners')
    .select('id, display_name, account_id')
    .is('archived_at', null);
  if (emailFilter) {
    // Schema: accounts.owner_user_id → auth.users.id. Email lives on
    // the auth row. Look up the auth user by email, then find the
    // account row, then filter learners.
    const users = await supabase.auth.admin.listUsers({ perPage: 200 });
    const match = users.data?.users?.find(
      (u) => u.email?.toLowerCase() === emailFilter.toLowerCase(),
    );
    if (!match) {
      console.error(`No auth user found with email ${emailFilter}`);
      process.exit(2);
    }
    const accountRes = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', match.id)
      .maybeSingle();
    if (!accountRes.data) {
      console.error(`Auth user ${match.id} has no account row`);
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
      // so the new job below has a clean slate.
      await supabase.from('extraction_jobs').delete().eq('material_id', mat.id);

      // 2d. Synthesize a fresh extraction_jobs row + flip the material
      // back to `pending` so the worker picks it up on the next drain
      // cycle. This is the same shape POST /materials/:id/retry would
      // produce, just done server-side here so the user doesn't have
      // to tap retry on every material manually.
      const photosRes = await supabase
        .from('material_photos')
        .select('position, client_blur_score, client_brightness, width, height')
        .eq('material_id', mat.id)
        .order('position', { ascending: true });
      const photoRows = (photosRes.data ?? []) as Array<{
        position: number;
        client_blur_score: number | null;
        client_brightness: number | null;
        width: number | null;
        height: number | null;
      }>;
      if (photoRows.length === 0) {
        console.log('    ⚠ no photos for this material — leaving in failed state');
        totals.materials += 1;
        totals.itemsArchived += archivedCount;
        continue;
      }
      // Look up learner's locale + subject_id from the material row.
      const matMeta = await supabase
        .from('materials')
        .select('subject_id')
        .eq('id', mat.id)
        .maybeSingle();
      const accLookup = await supabase
        .from('learners')
        .select('account_id, ui_locale')
        .eq('id', learner.id)
        .maybeSingle();
      const subjectId = (matMeta.data as { subject_id: string | null } | null)?.subject_id ?? null;
      const accountId =
        (accLookup.data as { account_id: string | null } | null)?.account_id ?? null;
      const locale =
        ((accLookup.data as { ui_locale: string | null } | null)?.ui_locale as string) ?? 'de';
      if (!accountId) {
        console.log('    ⚠ no account for this learner — leaving in failed state');
        totals.materials += 1;
        totals.itemsArchived += archivedCount;
        continue;
      }
      const jobInsert = await supabase.from('extraction_jobs').insert({
        material_id: mat.id,
        learner_id: learner.id,
        account_id: accountId,
        subject_id: subjectId,
        status: 'queued',
        attempts: 0,
        locale,
        title: null,
        client_quality_scores: photoRows.map((p) => ({
          position: p.position,
          blur: p.client_blur_score ?? 0,
          brightness: p.client_brightness ?? 0,
          width: p.width,
          height: p.height,
        })),
        credit_estimate: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (jobInsert.error) {
        console.log(`    ⚠ failed to enqueue retry job: ${jobInsert.error.message}`);
      } else {
        await supabase
          .from('materials')
          .update({ extraction_status: 'pending', extraction_error: null })
          .eq('id', mat.id);
      }

      console.log(`    ✓ archived ${archivedCount} items, queued for re-extraction`);
      totals.materials += 1;
      totals.itemsArchived += archivedCount;
      totals.jobsEnqueued += 1;
    }
  }

  console.log(
    `\n══════════════════════════════════════════════════════════════` +
      `\nDone: ${totals.materials} materials reset · ${totals.itemsArchived} items archived · ${totals.jobsEnqueued} jobs queued` +
      `\nThe worker drains queued jobs on a pg_cron schedule (every ~minute). No mobile-side retry tap needed.` +
      `\n══════════════════════════════════════════════════════════════`,
  );
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
