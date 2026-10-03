// The list the health check compares against is the folder, line for line (issue #342).

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXPECTED_MIGRATIONS } from '../migrations.js';

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../infra/supabase/migrations',
);

describe('EXPECTED_MIGRATIONS', () => {
  it('is exactly the migration files on disk, in order', () => {
    const files = readdirSync(DIR)
      .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
      .sort()
      .map((f) => f.replace(/\.sql$/, ''));
    expect([...EXPECTED_MIGRATIONS]).toEqual(files);
  });
});
