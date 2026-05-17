// Eval harness runner. Doc 06 §Eval harness.
//
// Replays a directory of fixtures against an LLM gateway (Fake by default,
// Vertex with `--backend=vertex`). For each fixture:
//   1. read meta.json and expected.json
//   2. if `images/` exists, load + base64-encode each file
//   3. call gateway.visionExtractAndGenerate(...)
//   4. structurally diff the result against expected.json (see lib/diff.ts)
//   5. print PASS / FAIL with per-assertion messages
//
// Exits non-zero if any fixture fails. CI wires this into the prompt-touching
// PR workflow (Doc 06 §Eval harness "CI fails on regression").
//
// USAGE:
//   pnpm -F @learnbuddy/api eval
//   pnpm -F @learnbuddy/api eval -- --backend=vertex
//   pnpm -F @learnbuddy/api eval -- --fixture=example-de-grade7-math
//   pnpm -F @learnbuddy/api eval -- --dir=evals/fixtures
//
// The Fake gateway emits a deterministic placeholder VisionResult (see
// apps/api/src/test/fake-llm.ts). The example fixture's expected.json is
// tuned to that output so a fresh checkout passes without any GCP setup.
// Real captures with stricter expectations land later — see the README in
// evals/fixtures/.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

import { loadEnv, type Env } from '../src/lib/env.js';
import { createLlmGateway } from '../src/lib/llm/factory.js';
import type { LLMGateway, VisionInput, VisionResult } from '../src/lib/llm/gateway.js';

import { diffVision, type DiffFailure, type ExpectedVision } from './lib/diff.js';

// ── CLI parsing ───────────────────────────────────────────────────────────

type Args = {
  backend: 'fake' | 'vertex' | null;
  dir: string;
  fixture: string | null;
};

function parseArgs(argv: string[]): Args {
  let backend: Args['backend'] = null;
  let dir = 'evals/fixtures';
  let fixture: string | null = null;
  for (const raw of argv) {
    if (raw.startsWith('--backend=')) {
      const v = raw.slice('--backend='.length);
      if (v !== 'fake' && v !== 'vertex') {
        throw new Error(`--backend must be 'fake' or 'vertex' (got "${v}")`);
      }
      backend = v;
    } else if (raw.startsWith('--dir=')) {
      dir = raw.slice('--dir='.length);
    } else if (raw.startsWith('--fixture=')) {
      fixture = raw.slice('--fixture='.length);
    }
  }
  return { backend, dir, fixture };
}

// ── Fixture loading ───────────────────────────────────────────────────────

type FixtureMeta = {
  locale: VisionInput['locale'];
  grade_level: number;
  subject: string;
  subject_kind: VisionInput['subjectKind'];
  target_item_count: number;
};

type Fixture = {
  name: string;
  meta: FixtureMeta;
  expected: ExpectedVision;
  images: VisionInput['images'];
};

function listFixtureDirs(root: string, only: string | null): string[] {
  if (!existsSync(root)) {
    throw new Error(`Fixture root not found: ${root}`);
  }
  const all = readdirSync(root)
    .filter((name) => !name.startsWith('.') && name !== 'README.md')
    .filter((name) => {
      try {
        return statSync(join(root, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
  return only ? all.filter((n) => n === only) : all;
}

function loadFixture(root: string, name: string): Fixture {
  const dir = join(root, name);
  const metaRaw = readFileSync(join(dir, 'meta.json'), 'utf8');
  const expectedRaw = readFileSync(join(dir, 'expected.json'), 'utf8');
  const meta = JSON.parse(metaRaw) as FixtureMeta;
  const expected = JSON.parse(expectedRaw) as ExpectedVision;

  const images: VisionInput['images'] = [];
  const imagesDir = join(dir, 'images');
  if (existsSync(imagesDir)) {
    const files = readdirSync(imagesDir)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort();
    for (const file of files) {
      const buf = readFileSync(join(imagesDir, file));
      const ext = file.toLowerCase().split('.').pop();
      const mimeType: VisionInput['images'][number]['mimeType'] =
        ext === 'png' ? 'image/png' : 'image/jpeg';
      images.push({ mimeType, data: buf.toString('base64') });
    }
  }

  return { name, meta, expected, images };
}

function fixtureToInput(fx: Fixture): VisionInput {
  return {
    images: fx.images,
    locale: fx.meta.locale,
    gradeLevel: fx.meta.grade_level,
    subject: fx.meta.subject,
    subjectKind: fx.meta.subject_kind,
    targetCount: fx.meta.target_item_count,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────

type FixtureResult = {
  name: string;
  failures: DiffFailure[];
  durationMs: number;
  cost_usd: number;
};

async function runFixture(gateway: LLMGateway, fx: Fixture): Promise<FixtureResult> {
  const started = Date.now();
  let result: VisionResult;
  try {
    result = await gateway.visionExtractAndGenerate(fixtureToInput(fx));
  } catch (err) {
    return {
      name: fx.name,
      failures: [
        {
          path: 'gateway',
          message: `threw: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      durationMs: Date.now() - started,
      cost_usd: 0,
    };
  }
  return {
    name: fx.name,
    failures: diffVision(result, fx.expected),
    durationMs: Date.now() - started,
    cost_usd: result.usage.cost_usd_micros / 1_000_000,
  };
}

function makeEnv(backend: Args['backend']): Env {
  // `--backend=vertex` only sets the selector; the GCP credentials still need
  // to be in the host env exactly as the real route uses them.
  const overrides: Partial<Record<string, string>> = {};
  if (backend) overrides.LLM_BACKEND = backend;
  // Without explicit creds the loader requires SUPABASE_* — supply harmless
  // placeholders since the eval runner never touches the DB.
  if (!process.env.SUPABASE_URL) overrides.SUPABASE_URL = 'http://localhost:54321';
  if (!process.env.SUPABASE_ANON_KEY) overrides.SUPABASE_ANON_KEY = 'eval-placeholder-anon-key';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    overrides.SUPABASE_SERVICE_ROLE_KEY = 'eval-placeholder-service-role-key';
  return loadEnv(overrides);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = makeEnv(args.backend);
  const gateway = createLlmGateway(env);

  const root = args.dir;
  const fixtureNames = listFixtureDirs(root, args.fixture);

  if (fixtureNames.length === 0) {
    console.error(
      `No fixtures found in ${root}${args.fixture ? ` matching "${args.fixture}"` : ''}.`,
    );
    process.exit(2);
  }

  const backendName = args.backend ?? env.LLM_BACKEND ?? 'auto';
  console.log(`[eval] backend=${backendName}  fixtures=${fixtureNames.length}`);

  const results: FixtureResult[] = [];
  for (const name of fixtureNames) {
    const fx = loadFixture(root, basename(name));
    const res = await runFixture(gateway, fx);
    results.push(res);

    const status = res.failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${res.name}  (${res.durationMs}ms, $${res.cost_usd.toFixed(6)})`);
    for (const f of res.failures) {
      console.log(`      - ${f.path}: ${f.message}`);
    }
  }

  const failed = results.filter((r) => r.failures.length > 0);
  const totalCost = results.reduce((acc, r) => acc + r.cost_usd, 0);
  console.log(
    `[eval] ${results.length - failed.length}/${results.length} passed  total_cost=$${totalCost.toFixed(6)}`,
  );

  process.exit(failed.length > 0 ? 1 : 0);
}

void main().catch((err) => {
  console.error('[eval] crashed:', err);
  process.exit(2);
});
