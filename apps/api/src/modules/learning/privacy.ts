// The learning domain's tables in her export and her account's deletion (issue #107, cut 6;
// docs/privacy.md §Export and deletion): registered at start-up (register.ts) in the order the
// deletion's content stage empties them — children first, so no delete waits on a cascade. What
// each exports is what was exported when identity/privacy.ts listed them itself.

import type { PrivacyTable } from '../identity/privacyTables.js';

export const LEARNING_PRIVACY_TABLES: readonly PrivacyTable[] = [
  { table: 'practice_turns' },
  {
    table: 'session_items',
    exported: `select si.* from session_items si join practice_sessions ps on ps.id = si.session_id
                where ps.learner_id = $1`,
    rows: `select si.ctid from session_items si join practice_sessions ps on ps.id = si.session_id
            where ps.learner_id = $1`,
  },
  { table: 'practice_sessions' },
  { table: 'item_states' },
  { table: 'items' },
  {
    // Concept-image crops of her sheets (issue #50): what exists, not the pixels. They live in
    // the photos' bucket and go the same way.
    table: 'material_images',
    exported: `select material_id, label, width, height, created_at from material_images
                where learner_id = $1`,
    files: `select storage_path from material_images where learner_id = $1`,
  },
  {
    // Search passages (issue #23): what exists per sheet. The text itself is a verbatim cut of
    // materials.extracted_text, which the export already carries in full.
    table: 'material_passages',
    exported: `select material_id, position, length(text) as chars, created_at
                 from material_passages where learner_id = $1`,
  },
  {
    table: 'material_photos',
    exported: `select mp.material_id, mp.position, mp.mime, mp.created_at from material_photos mp
                 join materials m on m.id = mp.material_id where m.learner_id = $1`,
    rows: `select mp.ctid from material_photos mp join materials m on m.id = mp.material_id
            where m.learner_id = $1`,
    // Every live photo: the account does not wait for Storage (D-9), the queue retries.
    files: `select mp.storage_path
              from material_photos mp join materials m on m.id = mp.material_id
             where m.learner_id = $1 and m.photos_deleted_at is null`,
  },
  { table: 'materials' },
  // Her roleplays in a foreign language and the checked feedback on them (issue #244).
  { table: 'buddy_roleplays' },
  // What her rehearsal talks and read-alouds measured (issue #264): numbers only, never a recording.
  { table: 'rehearsals' },
  { table: 'subjects' },
  {
    // Spots of a page the reading could not decide, and the reading she picked (issue #164):
    // what she was asked about her own sheet and what she answered — hers. Deleted with its sheet.
    table: 'material_unclear_spots',
    exported: `select material_id, sheet_id, ref, page, task, about, readings, status, answer,
                      items_added, asked_at, expires_at, answered_at, read_at
                 from material_unclear_spots where learner_id = $1 order by seq`,
    rows: null,
  },
];
