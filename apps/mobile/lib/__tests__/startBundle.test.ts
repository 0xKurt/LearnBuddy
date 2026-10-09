// What loads later never loads with the start (issues #251, #252, #312, #440). The note line's
// engraver (VexFlow), the shapes of the maps and pictures and their names are fetched with the
// first figure that needs them (`lib/lazyModule.ts`); one plain `import` anywhere in the app would
// put them back into the bundle every start loads, and nothing would look different.
//
// So this walks what the start bundle is built from: every route under app/ (expo-router bundles
// them all) and, from there, every import the bundler follows — TypeScript's own resolution, the
// web variant of a file as well, `import type` and `import()` not (the one is erased, the other is
// its own bundle part). None of them may reach a file that loads later. The size the split saves
// is measured on the real export (`tools/guards/bundle-budget.mjs`).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const MOBILE = join(__dirname, '../..');
const REPO = join(MOBILE, '../..');
const MATH = 'packages/shared-math/src';

/** Each file that loads later, and the hook that loads it. */
const LATER: Record<string, string> = {
  'apps/mobile/components/math/staff/engrave.ts': 'useEngraver',
  [`${MATH}/mapShapes.data.ts`]: 'useMapShapes',
  [`${MATH}/schematicShapes.data.ts`]: 'useSchematicShapes',
  [`${MATH}/figureNames.data.ts`]: 'useFigureNames',
  [`${MATH}/mapNames.data.ts`]: 'useFigureNames',
  [`${MATH}/schematics.data.ts`]: 'useFigureNames',
};

/** The app's compiler options: its paths and the bundler's resolution. */
function compilerOptions(): ts.CompilerOptions {
  const config = ts.getParsedCommandLineOfConfigFile(
    join(MOBILE, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  );
  if (!config) throw new Error('no tsconfig');
  return config.options;
}
const OPTIONS = compilerOptions();

/** The routes: every source file under app/. */
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : routes(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Whether an import or export brings in nothing but types (erased, never bundled). */
function typeOnly(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) return node.isTypeOnly;
  const clause = node.importClause;
  if (!clause) return false; // `import './x'`: run for its effect
  if (clause.isTypeOnly) return true;
  const named = clause.namedBindings;
  return (
    !clause.name &&
    named !== undefined &&
    ts.isNamedImports(named) &&
    named.elements.length > 0 &&
    named.elements.every((e) => e.isTypeOnly)
  );
}

/** The files `file` imports at its top level, resolved as the bundler does — web variants too. */
function imports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
  return source.statements.flatMap((node) => {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return [];
    const spec = node.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec) || typeOnly(node)) return [];
    const found = ts.resolveModuleName(spec.text, file, OPTIONS, ts.sys).resolvedModule;
    if (!found || found.isExternalLibraryImport) return [];
    const web = found.resolvedFileName.replace(/\.(tsx?)$/, '.web.$1');
    return existsSync(web) ? [found.resolvedFileName, web] : [found.resolvedFileName];
  });
}

/** Every file the start bundle is built from, each with the chain of imports that brings it in. */
function startGraph(): Map<string, string[]> {
  const chains = new Map<string, string[]>();
  const queue = routes(join(MOBILE, 'app')).map((f) => [f]);
  for (let chain = queue.shift(); chain; chain = queue.shift()) {
    const file = chain[chain.length - 1]!;
    if (chains.has(file)) continue;
    chains.set(file, chain);
    for (const next of imports(file)) if (!chains.has(next)) queue.push([...chain, next]);
  }
  return chains;
}

describe('the start bundle', () => {
  const graph = startGraph();
  const rel = (f: string) => relative(REPO, f);

  it('is walked from the routes into the figures', () => {
    // A walk that resolved nothing would find nothing to forbid.
    expect(graph.has(join(MOBILE, 'components/math/TapFigure.tsx'))).toBe(true);
    expect(graph.has(join(REPO, MATH, 'tap.ts'))).toBe(true);
  });

  it.each(Object.entries(LATER))('never holds %s (loaded later by %s)', (file) => {
    expect(existsSync(join(REPO, file)), `${file} is gone: update LATER`).toBe(true);
    const chain = graph.get(join(REPO, file));
    expect(chain?.map(rel).join('\n  → '), 'an import brings it into the start bundle').toBe(
      undefined,
    );
  });
});
