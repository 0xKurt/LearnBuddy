// The schema inventory (issue #281, D1): what every model purpose sends as system prompt and as
// `responseJsonSchema`, measured from the real modules — reproducible, without a model call and
// without a database, so it costs nothing and can be run on any commit.
//
//   pnpm --filter @learnbuddy/api inventory:schema            # writes docs/measurements/
//   pnpm --filter @learnbuddy/api inventory:schema -- --out <dir>   # anywhere else
//
// It imports the very constants the call sites pass (`TURN_STEP_SCHEMA`, `GENERATED_SCHEMA`, the
// explain schema of every kind of run from `explainSchemaFor` …) — `toJsonSchema` output, byte for
// byte — and counts with `measure.ts`.
//
//   … inventory:schema -- --baseline <older schema-inventory.json>
// adds a before → after table per call (D2's proof that each profile shrank, and by how much). Token counts are added ONLY when Vertex credentials are configured
// (`apps/api/.env.local` like every eval), via `countTokens`; they are the text-token count of the
// serialized text, NOT native usage, billing or cache (the provider may bill a schema
// differently from the same text sent as a prompt).
// requires live verification in Claude Code session (token counting needs Vertex; the rest is offline)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GoogleGenAI } from '@google/genai';
import * as contracts from '@learnbuddy/shared-types/contracts';
import type { StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { loadConfig } from '../../src/config.js';
import type { JsonSchema, LlmRequest } from '../../src/llm/gateway.js';
import { ensureCredentialsFile, modelFor, splitModelSpec } from '../../src/llm/vertex.js';
import * as buddyCheck from '../../src/modules/buddy/check.js';
import * as consolidate from '../../src/modules/buddy/consolidate.js';
import * as decision from '../../src/modules/buddy/decision.js';
import * as lookups from '../../src/modules/buddy/lookups.js';
import * as prompts from '../../src/modules/buddy/prompts.js';
import * as registry from '../../src/modules/buddy/registry.js';
import * as roleplay from '../../src/modules/buddy/roleplay.js';
import * as summarise from '../../src/modules/buddy/summarise.js';
import * as turn from '../../src/modules/buddy/turn.js';
import * as extract from '../../src/modules/materials/extract.js';
import * as images from '../../src/modules/materials/images.js';
import * as materials from '../../src/modules/materials/service.js';
import * as cloze from '../../src/modules/practice/cloze.js';
import * as generate from '../../src/modules/practice/generate.js';
import * as setProfiles from '../../src/modules/practice/setProfiles.js';
import * as hints from '../../src/modules/practice/hints.js';
import * as reexplain from '../../src/modules/practice/reexplain.js';
import * as practice from '../../src/modules/practice/answer.js';
import * as speak from '../../src/modules/practice/speak.js';
import * as structured from '../../src/modules/practice/structured.js';
import * as tutor from '../../src/modules/practice/tutor.js';
import * as voice from '../../src/modules/voice/service.js';
import {
  serialize,
  sha256,
  shapeOf,
  topLevelOf,
  unionsOf,
  type NamedUnion,
  type Shape,
  type Union,
} from './measure.js';

const API = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = resolve(API, '../..');
const DEFAULT_OUT = join(REPO, 'docs/measurements');

/**
 * Topics of the sheet-bound explain profile. The real enum is the learner's own sheet topics
 * (`generate.ts`, `sheetsOf`), so that profile's size depends on her sheets; three short
 * placeholders stand in for them, the same count Recherche 2 (#279) measured with.
 */
const SHEET_TOPICS: [string, ...string[]] = ['Brüche addieren', 'Brüche kürzen', 'Dezimalzahlen'];

/**
 * Every explain call there is: each kind of run, and the two kinds a photographed sheet can bind
 * (`sheetsOf` reads sheets only for a test or a practice). One row each, so a profile per kind
 * (D2) is measured against what that very kind sent before.
 */
const EXPLAIN_RUNS: { kind: StartTopicRequest['kind']; sheets: boolean }[] = [
  { kind: 'practice', sheets: false },
  { kind: 'test', sheets: false },
  { kind: 'vocab', sheets: false },
  { kind: 'speak', sheets: false },
  { kind: 'help', sheets: false },
  { kind: 'listen', sheets: false },
  { kind: 'spelling_dictation', sheets: false },
  { kind: 'practice', sheets: true },
  { kind: 'test', sheets: true },
];

const TOKEN_LABEL =
  'Text-token count of the serialized text (countTokens on a plain text part) — NOT native usage, billing or cache.';

type Variant = {
  purpose: LlmRequest['purpose'];
  /** Which of the purpose's schema/prompt combinations (the profiles that exist today). */
  profile: string;
  /** As the call site passes it (summary is the only 'fast' one). */
  tier: LlmRequest['tier'];
  promptVersion: string | undefined;
  system: string | undefined;
  schema: JsonSchema | undefined;
  /** Where the call site picks this combination. */
  where: string;
};

function variants(): Variant[] {
  const leanOf = (system: string | undefined) =>
    system === undefined ? undefined : `${system}\n\n${extract.LEAN_RULES}`;
  const buddy = prompts.BUDDY_PROMPT_VERSION;
  return [
    {
      purpose: 'buddy_turn',
      profile: 'step (lookups allowed; every first call of a turn)',
      tier: 'smart',
      promptVersion: buddy,
      system: prompts.TURN_SYSTEM,
      schema: turn.TURN_STEP_SCHEMA,
      where: 'buddy/turn.ts — final ? TURN_SCHEMA : TURN_STEP_SCHEMA',
    },
    {
      purpose: 'buddy_turn',
      profile: 'final (after MAX_LOOKUP_STEPS)',
      tier: 'smart',
      promptVersion: buddy,
      system: prompts.TURN_SYSTEM,
      schema: turn.TURN_SCHEMA,
      where: 'buddy/turn.ts',
    },
    {
      purpose: 'buddy_turn',
      profile: 'roleplay line (#244)',
      tier: 'smart',
      promptVersion: roleplay.ROLEPLAY_PROMPT_VERSION,
      system: roleplay.ROLEPLAY_SYSTEM,
      schema: roleplay.ROLEPLAY_TURN_SCHEMA,
      where: 'buddy/turn.ts — roleplayRound',
    },
    {
      purpose: 'buddy_turn',
      profile: 'roleplay feedback (#244)',
      tier: 'smart',
      promptVersion: roleplay.ROLEPLAY_PROMPT_VERSION,
      system: roleplay.ROLEPLAY_FEEDBACK_SYSTEM,
      schema: roleplay.FEEDBACK_SCHEMA,
      where: 'buddy/roleplay.ts',
    },
    {
      purpose: 'buddy_check',
      profile: 'step',
      tier: 'smart',
      promptVersion: buddy,
      system: prompts.CHECK_SYSTEM,
      schema: buddyCheck.CHECK_STEP_SCHEMA,
      where: 'buddy/check.ts — final ? CHECK_SCHEMA : CHECK_STEP_SCHEMA',
    },
    {
      purpose: 'buddy_check',
      profile: 'final',
      tier: 'smart',
      promptVersion: buddy,
      system: prompts.CHECK_SYSTEM,
      schema: buddyCheck.CHECK_SCHEMA,
      where: 'buddy/check.ts',
    },
    {
      purpose: 'explain',
      profile: 'GENERATED_SCHEMA (global)',
      tier: 'smart',
      promptVersion: generate.GENERATE_PROMPT_VERSION,
      system: generate.GENERATE_SYSTEM,
      schema: setProfiles.GENERATED_SCHEMA,
      where: 'practice/setProfiles.ts — GENERATED_SCHEMA',
    },
    ...EXPLAIN_RUNS.map(
      ({ kind, sheets }): Variant => ({
        purpose: 'explain',
        profile: sheets
          ? `kind=${kind} + sheets (${SHEET_TOPICS.length} placeholder topics)`
          : `kind=${kind}`,
        tier: 'smart',
        promptVersion: generate.GENERATE_PROMPT_VERSION,
        system: generate.GENERATE_SYSTEM,
        schema: setProfiles.explainSchemaFor(kind, sheets ? SHEET_TOPICS : null),
        where: `practice/setProfiles.ts — explainSchemaFor('${kind}', ${sheets ? 'sheets.topics' : 'null'})`,
      }),
    ),
    {
      purpose: 'extraction',
      profile: 'study',
      tier: 'smart',
      promptVersion: extract.EXTRACT_PROMPT_VERSION,
      system: extract.EXTRACT_SYSTEM,
      schema: materials.EXTRACTION_SCHEMA,
      where: 'materials/service.ts — homework ? HOMEWORK_* : EXTRACT_*',
    },
    {
      purpose: 'extraction',
      profile: 'study + LEAN_RULES (after a cut-off answer)',
      tier: 'smart',
      promptVersion: extract.EXTRACT_PROMPT_VERSION,
      system: leanOf(extract.EXTRACT_SYSTEM),
      schema: materials.EXTRACTION_SCHEMA,
      where: 'materials/service.ts — lean',
    },
    {
      purpose: 'extraction',
      profile: 'homework',
      tier: 'smart',
      promptVersion: extract.EXTRACT_PROMPT_VERSION,
      system: extract.HOMEWORK_SYSTEM,
      schema: materials.HOMEWORK_SCHEMA,
      where: 'materials/service.ts',
    },
    {
      purpose: 'extraction',
      profile: 'homework + LEAN_RULES',
      tier: 'smart',
      promptVersion: extract.EXTRACT_PROMPT_VERSION,
      system: leanOf(extract.HOMEWORK_SYSTEM),
      schema: materials.HOMEWORK_SCHEMA,
      where: 'materials/service.ts — lean',
    },
    {
      purpose: 'tutor',
      profile: 'tutor',
      tier: 'smart',
      promptVersion: tutor.TUTOR_PROMPT_VERSION,
      system: tutor.TUTOR_SYSTEM,
      schema: practice.TUTOR_SCHEMA,
      where: 'practice/answer.ts — asked.length ? RUBRIC_SCHEMA : TUTOR_SCHEMA',
    },
    {
      purpose: 'tutor',
      profile: 'rubric (#211)',
      tier: 'smart',
      promptVersion: tutor.TUTOR_PROMPT_VERSION,
      system: tutor.TUTOR_SYSTEM,
      schema: practice.RUBRIC_SCHEMA,
      where: 'practice/answer.ts',
    },
    {
      purpose: 'tutor',
      profile: 'cloze gaps (#232)',
      tier: 'smart',
      promptVersion: cloze.CLOZE_JUDGE_PROMPT_VERSION,
      system: cloze.JUDGE_SYSTEM,
      schema: cloze.GAP_SCHEMA,
      where: 'practice/cloze.ts',
    },
    {
      purpose: 'figures',
      profile: '-',
      tier: 'smart',
      promptVersion: images.FIGURES_PROMPT_VERSION,
      system: images.FIGURES_SYSTEM,
      schema: images.FIGURES_SCHEMA,
      where: 'materials/images.ts',
    },
    {
      purpose: 'hints',
      profile: '-',
      tier: 'smart',
      promptVersion: hints.HINTS_PROMPT_VERSION,
      system: hints.SYSTEM,
      schema: hints.HINTS_SCHEMA,
      where: 'practice/hints.ts',
    },
    {
      purpose: 'pronounce',
      profile: 'sentence',
      tier: 'smart',
      promptVersion: speak.PRONOUNCE_PROMPT_VERSION,
      system: speak.SYSTEM,
      schema: speak.JUDGEMENT_SCHEMA,
      where: 'practice/speak.ts',
    },
    {
      purpose: 'pronounce',
      profile: 'one word',
      tier: 'smart',
      promptVersion: `${speak.PRONOUNCE_PROMPT_VERSION}-word`,
      system: speak.WORD_SYSTEM,
      schema: speak.WORD_SCHEMA,
      where: 'practice/speak.ts',
    },
    {
      purpose: 'transcribe',
      profile: '-',
      tier: 'smart',
      promptVersion: voice.TRANSCRIBE_PROMPT_VERSION,
      system: voice.SYSTEM,
      schema: voice.SCHEMA,
      where: 'voice/service.ts',
    },
    {
      purpose: 'reexplain',
      profile: '-',
      tier: 'smart',
      promptVersion: reexplain.REEXPLAIN_PROMPT_VERSION,
      system: reexplain.REEXPLAIN_SYSTEM,
      schema: reexplain.SCHEMA,
      where: 'practice/reexplain.ts',
    },
    {
      purpose: 'consolidate',
      profile: '-',
      tier: 'smart',
      promptVersion: consolidate.CONSOLIDATE_PROMPT_VERSION,
      system: consolidate.SYSTEM,
      schema: consolidate.SCHEMA,
      where: 'buddy/consolidate.ts',
    },
    {
      purpose: 'summary',
      profile: '-',
      tier: 'fast',
      promptVersion: summarise.SUMMARY_PROMPT_VERSION,
      system: summarise.SYSTEM,
      schema: summarise.SCHEMA,
      where: 'buddy/summarise.ts',
    },
  ];
}

/** Every exported zod discriminated union of the contracts and the Buddy modules, by name. */
function namedUnions(): NamedUnion[] {
  const sources: Record<string, unknown>[] = [contracts, structured, registry, lookups, decision];
  const out: NamedUnion[] = [];
  for (const ns of sources) {
    for (const [name, value] of Object.entries(ns)) {
      if (!(value instanceof z.ZodDiscriminatedUnion)) continue;
      const u = value as z.ZodDiscriminatedUnion<string, z.ZodDiscriminatedUnionOption<string>[]>;
      out.push({ name, key: u.discriminator, tags: [...u.optionsMap.keys()].map(String) });
    }
  }
  return out;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

type Measured = {
  purpose: string;
  profile: string;
  tier: string;
  model: string;
  promptVersion: string;
  where: string;
  system: { chars: number; sha256: string; textTokens: number | null };
  schema: {
    chars: number;
    sha256: string;
    textTokens: number | null;
    shape: Shape;
    topLevel: ReturnType<typeof topLevelOf>;
  };
  unions: Union[];
};

export type Report = {
  issue: '#281';
  commit: string;
  commitDate: string;
  /** Uncommitted changes under apps/ or packages/ when it was generated. */
  dirty: boolean;
  sdk: string;
  zod: string;
  models: { smart: string; fast: string; location: string; routes: string };
  tokens: { status: 'counted' | 'not counted'; reason: string; label: string };
  method: string[];
  variants: Measured[];
  missing: { purpose: string; profile: string; what: string }[];
  /** The older report the markdown compares against (`--baseline`), or null. */
  baseline: { commit: string; file: string } | null;
};

function versionOf(pkg: string): string {
  const path = join(API, 'node_modules', pkg, 'package.json');
  if (!existsSync(path)) return 'unknown';
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return typeof parsed === 'object' && parsed !== null && 'version' in parsed
    ? String(parsed.version)
    : 'unknown';
}

/** A counter for text tokens when Vertex is configured, else null with the reason. */
function tokenCounter():
  | { count: (model: string, text: string) => Promise<number>; reason: string }
  | { count: null; reason: string } {
  loadDotenv({ path: join(API, '.env.local'), quiet: true });
  const env = process.env;
  if (env.LLM_BACKEND !== 'vertex' || !env.GOOGLE_CLOUD_PROJECT)
    return {
      count: null,
      reason: 'no Vertex configuration (LLM_BACKEND=vertex, GOOGLE_CLOUD_PROJECT)',
    };
  const hasFile =
    !!env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!hasFile && !env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    return { count: null, reason: 'no Vertex service-account credentials' };
  const config = runConfig();
  ensureCredentialsFile(config);
  const clients = new Map<string, GoogleGenAI>();
  const cache = new Map<string, number>();
  return {
    reason: `countTokens on Vertex (${config.GOOGLE_CLOUD_PROJECT})`,
    count: async (spec, text) => {
      const key = `${spec}:${sha256(text)}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const { location, model } = splitModelSpec(spec, config.GOOGLE_VERTEX_LOCATION);
      let client = clients.get(location);
      if (!client) {
        client = new GoogleGenAI({
          vertexai: true,
          project: config.GOOGLE_CLOUD_PROJECT,
          location,
        });
        clients.set(location, client);
      }
      const res = await client.models.countTokens({
        model,
        contents: [{ role: 'user', parts: [{ text }] }],
      });
      const n = res.totalTokens ?? 0;
      cache.set(key, n);
      return n;
    },
  };
}

/** The app's configuration with placeholders for everything the inventory does not touch. */
function runConfig() {
  return loadConfig({
    ...process.env,
    // Without a project the routes and model names are still the configured defaults.
    LLM_BACKEND: process.env.GOOGLE_CLOUD_PROJECT ? process.env.LLM_BACKEND : 'disabled',
    DATABASE_URL: 'postgres://unused/unused',
    SUPABASE_URL: 'http://x.local',
    SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  });
}

export async function buildReport(): Promise<Report> {
  const named = namedUnions();
  const counter = tokenCounter();
  const config = runConfig();
  const missing: Report['missing'] = [];
  const measured: Measured[] = [];
  for (const v of variants()) {
    const absent = [
      v.schema === undefined ? 'schema' : null,
      v.system === undefined ? 'system prompt' : null,
      v.promptVersion === undefined ? 'prompt version' : null,
    ].filter((x): x is string => x !== null);
    if (v.schema === undefined || v.system === undefined || v.promptVersion === undefined) {
      missing.push({
        purpose: v.purpose,
        profile: v.profile,
        what: `${absent.join(', ')} not exported on this commit`,
      });
      continue;
    }
    const model = modelFor(config, { purpose: v.purpose, tier: v.tier });
    const text = serialize(v.schema);
    const unions = unionsOf(v.schema, named);
    measured.push({
      purpose: v.purpose,
      profile: v.profile,
      tier: v.tier,
      model,
      promptVersion: v.promptVersion,
      where: v.where,
      system: {
        chars: v.system.length,
        sha256: sha256(v.system),
        textTokens: counter.count ? await counter.count(model, v.system) : null,
      },
      schema: {
        chars: text.length,
        sha256: sha256(text),
        textTokens: counter.count ? await counter.count(model, text) : null,
        shape: shapeOf(v.schema),
        topLevel: topLevelOf(v.schema),
      },
      unions,
    });
  }
  const status = git(['status', '--porcelain', '--', 'apps', 'packages']);
  return {
    issue: '#281',
    commit: git(['rev-parse', 'HEAD']),
    commitDate: git(['show', '-s', '--format=%cI', 'HEAD']),
    dirty: status.length > 0,
    sdk: `@google/genai ${versionOf('@google/genai')}`,
    zod: versionOf('zod'),
    models: {
      smart: config.VERTEX_MODEL_SMART,
      fast: config.VERTEX_MODEL_FAST,
      location: config.GOOGLE_VERTEX_LOCATION,
      routes: JSON.stringify(config.VERTEX_ROUTES),
    },
    tokens: {
      status: counter.count ? 'counted' : 'not counted',
      reason: counter.reason,
      label: TOKEN_LABEL,
    },
    method: [
      'Schemas are the exported module constants (toJsonSchema output) the call sites pass; chars = JSON.stringify length.',
      'descriptions.textChars = the description strings; descriptions.withKeyChars = chars lost when every description keyword is removed (text + key + quotes + separator + escapes).',
      'anyOfNodes counts every anyOf; nullableAnyOf = anyOf [X, {type:null}]; unions = the rest (real choices), unionBranches = their branches.',
      'maxDepth counts schema nodes (properties, items, anyOf branches), root = 1. optionalFields = properties not in required.',
      'enums / enumValues over every enum keyword; singletonEnums = one-value enums (string-literal tags).',
      'name + enum chars = characters of every property name plus every enum value: the text the decoder must spell exactly (Google lists long property/enum names first among the causes of "too many states"). A cause counted, not a state count.',
      'explain: one row per kind of run (and per kind a photographed sheet can bind), each the schema explainSchemaFor(kind, topics) returns — the function the call site sends.',
      'A union is tagged by the first property that is a required one-value enum in every branch; tagPositions = index of that key in each branch (declared order of the emitted schema, not the order the model writes).',
      `The sheet-bound explain profile uses ${SHEET_TOPICS.length} placeholder topics; the real enum is the learner's sheet topics.`,
      'Token counts (when present): ' + TOKEN_LABEL,
    ],
    variants: measured,
    missing,
    baseline: null,
  };
}

// ---------------------------------------------------------------- Markdown

const n = (x: number) => x.toLocaleString('en-US').replace(/,/g, ' ');
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const tok = (x: number | null) => (x === null ? '—' : n(x));

function structureCells(s: Shape): string[] {
  return [
    n(s.anyOfNodes),
    n(s.nullableAnyOf),
    `${n(s.unions)} / ${n(s.unionBranches)}`,
    n(s.maxDepth),
    n(s.optionalFields),
    `${n(s.enums)} / ${n(s.enumValues)}`,
    n(s.propertyNameChars + s.enumValueChars),
  ];
}
const STRUCTURE_HEAD =
  'anyOf | nullable | unions / branches | depth | optional | enums / values | name + enum chars';

function branchTable(u: Union): string[] {
  const total = u.shape.chars;
  const rows = [...u.branches].sort((a, b) => b.shape.chars - a.shape.chars);
  return [
    `| ${u.tagKey ?? 'branch'} | chars | share | desc text | desc + key | ${STRUCTURE_HEAD} |`,
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
    ...rows.map(
      (b) =>
        `| \`${b.tag}\` | ${n(b.shape.chars)} | ${pct(b.shape.chars / total)} | ${n(b.shape.descriptions.textChars)} | ${n(b.shape.descriptions.withKeyChars)} | ${structureCells(b.shape).join(' | ')} |`,
    ),
  ];
}

export function renderMarkdown(r: Report): string {
  const out: string[] = [];
  out.push('# Schema inventory (D1, issue #281)');
  out.push('');
  out.push(
    `Generated by \`pnpm --filter @learnbuddy/api inventory:schema\` (\`apps/api/evals/schema/inventory.ts\`) — no model call, no database. ` +
      `Commit \`${r.commit.slice(0, 12)}\` (${r.commitDate})${r.dirty ? ', **with uncommitted changes under apps/ or packages/**' : ''}; ${r.sdk}, zod ${r.zod}; ` +
      `models: smart \`${r.models.smart}\`, fast \`${r.models.fast}\`, location \`${r.models.location}\`, routes ${r.models.routes}. ` +
      'The JSON next to this file has every number below plus the structure of every branch.',
  );
  out.push('');
  out.push(
    `**Tokens: ${r.tokens.status}** (${r.tokens.reason}). ${r.tokens.label} Characters are exact; they are not tokens.`,
  );
  out.push('');
  out.push('How it counts:');
  for (const m of r.method) out.push(`- ${m}`);
  out.push('');
  if (r.missing.length > 0) {
    out.push('**Not measured on this commit:**');
    for (const m of r.missing) out.push(`- ${m.purpose} / ${m.profile}: ${m.what}`);
    out.push('');
  }

  out.push('## Per purpose and profile');
  out.push('');
  out.push(
    `| purpose | profile | prompt | system chars | system tok | schema chars | schema tok | desc # | desc text | desc + key (share) | ${STRUCTURE_HEAD} | schema sha256 |`,
  );
  out.push('|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|');
  for (const v of r.variants) {
    const s = v.schema.shape;
    out.push(
      `| ${v.purpose} | ${v.profile} | \`${v.promptVersion}\` | ${n(v.system.chars)} | ${tok(v.system.textTokens)} | ${n(v.schema.chars)} | ${tok(v.schema.textTokens)} | ${n(s.descriptions.count)} | ${n(s.descriptions.textChars)} | ${n(s.descriptions.withKeyChars)} (${pct(s.descriptions.withKeyChars / s.chars)}) | ${structureCells(s).join(' | ')} | \`${v.schema.sha256.slice(0, 12)}\` |`,
    );
  }
  out.push('');

  out.push('## Top-level fields of the large schemas');
  out.push('');
  const topShown = new Map<string, string>();
  for (const v of r.variants.filter((x) => x.schema.chars >= 5000 && !x.profile.includes('LEAN'))) {
    const same = topShown.get(v.schema.sha256);
    if (same) {
      out.push(`**${v.purpose} — ${v.profile}**: the same schema as ${same}.`);
      out.push('');
      continue;
    }
    topShown.set(v.schema.sha256, `${v.purpose} — ${v.profile}`);
    out.push(`**${v.purpose} — ${v.profile}** (${n(v.schema.chars)} chars)`);
    out.push('');
    out.push('| field | chars | share | desc text | desc + key |');
    out.push('|---|--:|--:|--:|--:|');
    for (const t of [...v.schema.topLevel].sort((a, b) => b.chars - a.chars)) {
      out.push(
        `| \`${t.key}\` | ${n(t.chars)} | ${pct(t.share)} | ${n(t.descriptions.textChars)} | ${n(t.descriptions.withKeyChars)} |`,
      );
    }
    out.push('');
  }

  out.push('## The `actions` container, per action branch');
  out.push('');
  for (const v of r.variants.filter(
    (x) => x.purpose === 'buddy_turn' || x.purpose === 'buddy_check',
  )) {
    const u = v.unions.find((x) => x.path === '.actions[]');
    if (!u) continue;
    out.push(
      `**${v.purpose} — ${v.profile}**: \`${u.path}\` = ${u.name ?? 'unnamed'}, ${u.branches.length} branches, ${n(u.shape.chars)} chars (${pct(u.shape.chars / v.schema.chars)} of the schema).`,
    );
    out.push('');
    out.push(...branchTable(u));
    out.push('');
  }

  out.push('## The task schemas, per form and per union branch');
  out.push('');
  out.push(
    'Every real union in the explain and extraction schemas, where it sits and what it costs (one row per occurrence: a union used in two places costs twice). The item `kind` is an enum, not a union, so it has no per-form serialization of its own; the forms that carry their own structure are the union branches below.',
  );
  out.push('');
  const tasksShown = new Map<string, string>();
  for (const v of r.variants.filter(
    (x) => (x.purpose === 'explain' || x.purpose === 'extraction') && !x.profile.includes('LEAN'),
  )) {
    const same = tasksShown.get(v.schema.sha256);
    if (same) {
      out.push(`**${v.purpose} — ${v.profile}**: the same schema as ${same}.`);
      out.push('');
      continue;
    }
    tasksShown.set(v.schema.sha256, `${v.purpose} — ${v.profile}`);
    out.push(`**${v.purpose} — ${v.profile}** (${n(v.schema.chars)} chars)`);
    out.push('');
    if (v.unions.length === 0) {
      out.push('No union left in this schema.');
      out.push('');
      continue;
    }
    out.push(`| path | union | tag | branches | chars | share | desc + key | ${STRUCTURE_HEAD} |`);
    out.push('|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
    for (const u of v.unions) {
      out.push(
        `| \`${u.path}\` | ${u.name ?? '—'} | ${u.tagKey ?? '—'} | ${u.branches.length} | ${n(u.shape.chars)} | ${pct(u.shape.chars / v.schema.chars)} | ${n(u.shape.descriptions.withKeyChars)} | ${structureCells(u.shape).join(' | ')} |`,
      );
    }
    out.push('');
  }
  const global = r.variants.find(
    (x) => x.purpose === 'explain' && x.profile.startsWith('GENERATED_SCHEMA'),
  );
  if (global) {
    out.push(`### Branches of every union in \`explain — ${global.profile}\``);
    out.push('');
    for (const u of global.unions) {
      out.push(`**\`${u.path}\`** — ${u.name ?? 'unnamed'} (${n(u.shape.chars)} chars)`);
      out.push('');
      out.push(...branchTable(u));
      out.push('');
    }
  }

  out.push('## Tag position (input to E1)');
  out.push('');
  out.push(
    'Where each tagged union declares its tag in the emitted schema (0 = first property). This is the order the model is SHOWN; whether the model also WRITES the tag first is a property of the response and is not measured here.',
  );
  out.push('');
  out.push('| purpose / profile | path | union | tag | positions |');
  out.push('|---|---|---|---|---|');
  const seen = new Set<string>();
  for (const v of r.variants) {
    for (const u of v.unions) {
      if (u.tagKey === null) continue;
      const key = `${u.path}|${u.name}|${u.tagPositions.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const allFirst = u.tagPositions.every((p) => p === 0);
      out.push(
        `| ${v.purpose} / ${v.profile} | \`${u.path}\` | ${u.name ?? '—'} | ${u.tagKey} | ${allFirst ? 'all 0' : u.tagPositions.join(', ')} |`,
      );
    }
  }
  const untagged = r.variants.flatMap((v) =>
    v.unions.filter((u) => u.tagKey === null).map((u) => `${v.purpose} \`${u.path}\``),
  );
  out.push('');
  out.push(
    untagged.length === 0
      ? 'Every real union is tagged.'
      : `Unions without a common tag: ${[...new Set(untagged)].join(', ')}.`,
  );
  out.push('');
  return out.join('\n');
}

/** One call measured on two commits: what it sent before and what it sends now. */
export type Change = {
  purpose: string;
  profile: string;
  before: Shape;
  after: Shape;
  sameSchema: boolean;
};

/** The calls measured in both reports, matched by purpose and profile, in `after`'s order. */
export function changesBetween(before: Report, after: Report): Change[] {
  const old = new Map(before.variants.map((v) => [`${v.purpose}|${v.profile}`, v]));
  return after.variants.flatMap((v) => {
    const b = old.get(`${v.purpose}|${v.profile}`);
    return b
      ? [
          {
            purpose: v.purpose,
            profile: v.profile,
            before: b.schema.shape,
            after: v.schema.shape,
            sameSchema: b.schema.sha256 === v.schema.sha256,
          },
        ]
      : [];
  });
}

const arrow = (a: number, b: number) => (a === b ? n(a) : `${n(a)} → ${n(b)}`);
const delta = (a: number, b: number) =>
  a === b ? '±0' : `${b < a ? '−' : '+'}${((Math.abs(b - a) / a) * 100).toFixed(1)} %`;

export function renderComparison(before: Report, after: Report): string {
  const out: string[] = [];
  out.push(`## Before → after (D2: profiles per call, issue #281)`);
  out.push('');
  out.push(
    `Before: commit \`${before.commit.slice(0, 12)}\`${before.dirty ? ' (with uncommitted changes)' : ''}. After: commit \`${after.commit.slice(0, 12)}\`${after.dirty ? ' (with uncommitted changes)' : ''}. ` +
      'Same purpose and profile = the same call. The structural columns are the causes Google names for "too many states for serving" (optional properties, enum values, long names, nesting), counted — Vertex publishes no state count and none is computed here.',
  );
  out.push('');
  out.push(
    '| purpose | profile | schema chars | Δ chars | anyOf | nullable | unions / branches | optional | enum values | name + enum chars | depth |',
  );
  out.push('|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const c of changesBetween(before, after)) {
    const a = c.before;
    const b = c.after;
    out.push(
      `| ${c.purpose} | ${c.profile} | ${arrow(a.chars, b.chars)} | ${c.sameSchema ? 'same bytes' : delta(a.chars, b.chars)} | ${arrow(a.anyOfNodes, b.anyOfNodes)} | ${arrow(a.nullableAnyOf, b.nullableAnyOf)} | ${arrow(a.unions, b.unions)} / ${arrow(a.unionBranches, b.unionBranches)} | ${arrow(a.optionalFields, b.optionalFields)} | ${arrow(a.enumValues, b.enumValues)} | ${arrow(a.propertyNameChars + a.enumValueChars, b.propertyNameChars + b.enumValueChars)} | ${arrow(a.maxDepth, b.maxDepth)} |`,
    );
  }
  const gone = before.variants.filter(
    (v) => !after.variants.some((x) => x.purpose === v.purpose && x.profile === v.profile),
  );
  if (gone.length > 0) {
    out.push('');
    out.push(`Only in the baseline: ${gone.map((v) => `${v.purpose} / ${v.profile}`).join(', ')}.`);
  }
  out.push('');
  return out.join('\n');
}

function argOf(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ? resolve(v) : null;
}

async function main(): Promise<void> {
  const dir = argOf('--out') ?? DEFAULT_OUT;
  const baselinePath = argOf('--baseline');
  const report = await buildReport();
  const baseline: Report | null = baselinePath
    ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Report)
    : null;
  if (baseline && baselinePath)
    report.baseline = { commit: baseline.commit, file: relative(REPO, baselinePath) };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'schema-inventory.json'), `${JSON.stringify(report, null, 1)}\n`);
  writeFileSync(
    join(dir, 'schema-inventory.md'),
    renderMarkdown(report) + (baseline ? `\n${renderComparison(baseline, report)}` : ''),
  );
  for (const v of report.variants) {
    console.log(
      `${v.purpose.padEnd(12)} ${v.profile.slice(0, 40).padEnd(40)} system ${String(v.system.chars).padStart(6)}  schema ${String(v.schema.chars).padStart(6)}  unions ${v.schema.shape.unions}`,
    );
  }
  for (const m of report.missing) console.log(`MISSING ${m.purpose} / ${m.profile}: ${m.what}`);
  console.log(`\nwritten to ${dir} (tokens: ${report.tokens.status} — ${report.tokens.reason})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
