// The generic core by construction (issue #107, cut 10): what a copy without the learning domain
// takes, and what it writes in the domain's place.
//
// - Every file of the domain (tools/guards/boundaries.config.mjs `DOMAIN`) stays out.
// - The two seams where the apps hand over to the domain (`registerLearning` in the API and in
//   the app) are written again: the app's registers nothing, the API's the core's own context
//   (seams/api-register.ts.txt), so it starts (`pnpm core-check` boots it).
// - The contracts barrel loses its exports of domain contracts and gains the core's own
//   assembly of the conversation and home (`buddyContracts` with no domain).
// - Tests, the test harness, evals and scripts that reach a file which stayed out stay out
//   too, and so does a spec that names the domain without importing it (`namesDomain`).
//   Production code never does: the boundary guard holds it to the two seams.
// - The database: one migration, the core's baseline (baseline.ts), in place of the source's.

import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The kit's own files written into a core copy (packages/buddy-kit/seams/). Kept as text: their
 * imports resolve only in the copy, where core-check typechecks and runs them.
 */
const SEAMS = fileURLToPath(new URL('../seams/', import.meta.url));
const seam = (name: string) => readFileSync(join(SEAMS, name), 'utf8');

/**
 * The seams: the one place each app calls the domain. The app's registers nothing; the API's
 * registers the core's own context (a Buddy that knows only its own state), so it starts.
 */
export const CORE_SEAMS: Readonly<Record<string, string>> = {
  'apps/api/src/modules/learning/register.ts': seam('api-register.ts.txt'),
  // The domain's part of the API's test fakes (vitest.config.ts setupFiles): none.
  'apps/api/src/testing/domain.ts': `// A Buddy without the learning domain (create-buddy --core, issue #107): no domain's part
// of the test fakes — the scripted gateway has no choice step to answer.
// requires live verification in Claude Code session (paired with a real Postgres)
export {};
`,
  'apps/mobile/lib/learning/register.tsx': `// A Buddy without the learning domain (create-buddy --core, issue #107): nothing to register.
// A domain of this Buddy registers its cards, start entries and attachments here.
export function registerLearning(): void {}
`,
};

/** A boot of the core copy's API without database or model (core-check). */
export const CORE_BOOT = { path: 'apps/api/scripts/core-boot.ts', text: seam('core-boot.ts.txt') };

/** The contracts barrel, and the core's own assembly it exports in a core copy. */
export const CONTRACTS_BARREL = 'packages/shared-types/src/contracts/index.ts';
export const CORE_ASSEMBLY = 'packages/shared-types/src/contracts/buddyCore.ts';
export const CORE_ASSEMBLY_TEXT = `// The conversation and home of a Buddy without a domain (create-buddy --core, issue #107):
// the core's own tools, message and home, assembled with nothing added (\`buddyContracts\`).

import { z } from 'zod';

import { buddyContracts } from './buddy.js';

const core = buddyContracts({ actions: [], message: {}, home: {} });

export const ActionSummary = core.ActionSummary;
export type ActionSummary = z.infer<typeof ActionSummary>;
export const ActionView = core.ActionView;
export type ActionView = z.infer<typeof ActionView>;
export const MessageView = core.MessageView;
export type MessageView = z.infer<typeof MessageView>;
export const BuddyHome = core.BuddyHome;
export type BuddyHome = z.infer<typeof BuddyHome>;
export const SendMessageResponse = core.SendMessageResponse;
export type SendMessageResponse = z.infer<typeof SendMessageResponse>;
`;

/** The barrel without the exports of files that stayed out, and with the core's assembly. */
export function coreBarrel(text: string, copied: ReadonlySet<string>): string {
  const dir = CONTRACTS_BARREL.slice(0, CONTRACTS_BARREL.lastIndexOf('/'));
  const kept = text.split('\n').filter((line) => {
    const m = /^export \* from '\.\/([^']+)\.js';$/.exec(line);
    return !m || copied.has(`${dir}/${m[1]}.ts`);
  });
  while (kept.at(-1) === '') kept.pop();
  return `${kept.join('\n')}\nexport * from './buddyCore.js';\n`;
}

/**
 * A package.json without its dependencies on workspace packages that stayed out (the API's
 * `@learnbuddy/shared-math`): the core copy installs without them.
 */
export function corePackageJson(text: string, present: ReadonlySet<string>): string {
  const pkg = JSON.parse(text) as Record<string, unknown>;
  let dropped = false;
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      const local = /^@learnbuddy\/([a-z-]+)$/.exec(name);
      if (
        local &&
        version.startsWith('workspace:') &&
        !present.has(`packages/${local[1]}/package.json`)
      ) {
        delete deps[name];
        dropped = true;
      }
    }
  }
  return dropped ? `${JSON.stringify(pkg, null, 2)}\n` : text;
}

/** Not production code: tests, the harness, evals and scripts run by hand. */
export function isSupport(file: string): boolean {
  return (
    /(\/__tests__\/|\.test\.tsx?$|\/testing\/)/.test(file) ||
    /^apps\/api\/(evals|scripts)\//.test(file)
  );
}

const IMPORT = /(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g;
const WORKSPACE = /(?:from|import)\s*\(?\s*'@learnbuddy\/([a-z-]+)['/]/g;

/** Each relative import of a source file, as the repository paths it may resolve to. */
function relativeImports(root: string, file: string): string[][] {
  const text = readFileSync(join(root, file), 'utf8');
  const dir = file.slice(0, file.lastIndexOf('/'));
  const relative = [...text.matchAll(IMPORT)].map((m) => {
    const spec = normalize(`${dir}/${m[1]}`);
    const base = spec.replace(/\.(m?js|tsx?)$/, '');
    return [spec, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}/index.ts`];
  });
  // A workspace package (`@learnbuddy/shared-math`) is there when its package.json is.
  const workspace = [...text.matchAll(WORKSPACE)].map((m) => [`packages/${m[1]}/package.json`]);
  return [...relative, ...workspace];
}

/**
 * What tells a test of the domain from one of the core where no import does (issue #107): a spec
 * that drives practice through the domain's routes, scripts one of its tools or reads one of its
 * tables never imports the domain, and fails in a copy without it. The guard's lists
 * (tools/guards/boundaries.config.mjs DOMAIN_TABLES, DOMAIN_TOOLS, DOMAIN_ROUTES).
 */
export type DomainSignals = {
  tables: readonly string[];
  tools: readonly string[];
  routes: readonly string[];
};

/** What the kit reads of the guard's configuration (tools/guards/boundaries.config.mjs). */
export type Guard = {
  DOMAIN: string[];
  DOMAIN_TABLES: string[];
  DOMAIN_TOOLS: string[];
  DOMAIN_ROUTES: string[];
};

export const signalsOf = (g: Guard): DomainSignals => ({
  tables: g.DOMAIN_TABLES,
  tools: g.DOMAIN_TOOLS,
  routes: g.DOMAIN_ROUTES,
});

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** A spec of the domain that names none of it says so in its header (the core's FK names, say). */
export const DOMAIN_MARK = '@buddy-kit domain';

/** Whether a support file's text names the domain: a route of it, a tool of it, a table of it. */
export function namesDomain(text: string, signals: DomainSignals): boolean {
  if (text.includes(DOMAIN_MARK)) return true;
  const any = (xs: readonly string[]) => xs.map(escaped).join('|');
  // A route's `:id` stands for whatever the spec puts there (`${id}`, a literal uuid).
  const paths = signals.routes.map((r) => escaped(r).replace(/:[a-z_]+/gi, '[^/\'"`]+')).join('|');
  const route = new RegExp(`['"\`](/v1)?(${paths})(/|['"\`?])`);
  const tool = new RegExp(`['"\`](${any(signals.tools)})['"\`]`);
  const table = new RegExp(
    `\\b(from|into|update|join|table)\\s+(public\\.)?(${any(signals.tables)})\\b`,
    'i',
  );
  return route.test(text) || tool.test(text) || table.test(text);
}

/**
 * The support files of a copy that reach a file which is not there (stayed out, or was left out
 * in an earlier round), or name the domain (`namesDomain`): they go too, until nothing left
 * reaches a gap. Production code is not looked at — it may never reach the domain, and the
 * typecheck of the copy says so if it does.
 */
export function supportReachingGaps(
  root: string,
  files: readonly string[],
  signals?: DomainSignals,
): string[] {
  // A spec that imports a seam asks for what the domain registers there: a copy's seams register
  // nothing of it, so such a spec is the domain's.
  const seams = new Set(Object.keys(CORE_SEAMS));
  const present = new Set(files.filter((f) => !seams.has(f)));
  const out = new Set<string>();
  const there = (c: string) => present.has(c) && !out.has(c);
  for (const f of files) {
    if (!signals || !isSupport(f) || !/\.(tsx?|mjs)$/.test(f)) continue;
    if (namesDomain(readFileSync(join(root, f), 'utf8'), signals)) out.add(f);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of files) {
      if (out.has(f) || !isSupport(f) || !/\.(tsx?|mjs)$/.test(f)) continue;
      if (relativeImports(root, f).some((cands) => !cands.some(there))) {
        out.add(f);
        changed = true;
      }
    }
  }
  return [...out].sort();
}
