// Operator-only, content-free diagnosis. docs/privacy.md §Access control; issue #951.
import { z } from 'zod';
import { createDb } from '../src/lib/db.js';
import { ERROR_STATUS } from '../src/lib/errors.js';

// Validation errors can quote model/child text. Never print an arbitrary error string, even
// though the column is named "errors". Unknown details remain explicitly redacted.
const codes = [
  ...Object.keys(ERROR_STATUS),
  'invalid',
  'model_invalid',
  'budget',
  'stopped',
  'blocked',
  'timeout',
  'refused',
  'invalid_output',
  'cancelled',
];

async function main() {
  const id = process.argv[2];
  if (process.argv.length !== 3 || !z.string().uuid().safeParse(id).success) {
    console.error('usage: decision-why.ts <decision_id>');
    process.exitCode = 2;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const db = createDb(url, { max: 1, ca: process.env.DATABASE_CA_CERT });
  try {
    const result = await db.tx(async (tx) => {
      await tx.query('set transaction read only');
      const decision = await tx.maybeOne(
        `select disposition,
           case when errors is null then null else
             (select coalesce(jsonb_agg(case when e=any($2::text[]) then e else 'redacted' end), '[]'::jsonb)
              from jsonb_array_elements_text(
                case when jsonb_typeof(errors)='array' then errors else '["redacted"]'::jsonb end
              ) e) end as errors,
           model, prompt_version
         from buddy_decisions where id=$1`,
        [id, codes],
      );
      if (!decision) return null;
      const calls = await tx.query(
        `select schema_variant, round, attempts,
           case when error_code=any($2::text[]) then error_code
                when error_code is null then null else 'redacted' end as error_code
         from llm_calls where decision_id=$1 order by round nulls last, created_at, id`,
        [id, codes],
      );
      return { ...decision, calls };
    });
    console.info(JSON.stringify(result, null, 2));
    if (result === null) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch(() => {
  // Neither database errors (which can contain rows) nor credentials belong in diagnostics.
  console.error('Decision inspection failed. Check operator access and database availability.');
  process.exitCode = 1;
});
