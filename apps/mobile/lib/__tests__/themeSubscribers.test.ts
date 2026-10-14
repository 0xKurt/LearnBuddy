// A palette change repaints without remounting the tree (issue #631). Read from the source like
// `headerShell.test.ts`.
//
// The provider used to remount everything under `<ThemeScope key={name}>`. On Android that remount
// lands while react-native-screens is still running the outgoing screens' removal transitions, and
// an orb's animated zIndex reorder inside one of them threw "The specified child already has a
// parent" (device check 14.10.2026). It also took 8–12 s on the phone, splash orb included.
//
// Without the remount, only components that read the theme context render again. So every
// component whose render reads a palette-bound token (`TYPE.…`, `SHADOW.…`) subscribes with
// `useTheme()` (or `useAppliedPalette()` above the provider) — it then renders again on a change and
// picks up the new token objects (`lib/theme/type.ts`, `shadow.ts` replace them on a change, so
// React Native sees a new style and repaints).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

type Source = { file: string; text: string };

function sources(dir: string): Source[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name)
      ? [{ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

const TOKEN = /\b(TYPE|SHADOW)\./;
const SUBSCRIBES = /\buse(Theme|AppliedPalette)\(/;

/** A function that renders: its name starts with a capital letter. */
function componentsOf(tree: ts.SourceFile): Array<{ name: string; body: ts.Node }> {
  const out: Array<{ name: string; body: ts.Node }> = [];
  (function walk(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text) && node.body)
      out.push({ name: node.name.text, body: node.body });
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /^[A-Z]/.test(node.name.text) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      out.push({ name: node.name.text, body: node.initializer.body });
    node.forEachChild(walk);
  })(tree);
  return out;
}

/** Components that read a palette-bound token in their own body without subscribing. */
function unsubscribed(source: Source): string[] {
  if (!TOKEN.test(source.text)) return [];
  const tree = ts.createSourceFile(
    source.file,
    source.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return componentsOf(tree)
    .filter(({ body }) => {
      const text = body.getText();
      return TOKEN.test(text) && !SUBSCRIBES.test(text);
    })
    .map(({ name }) => `${source.file} ${name}`);
}

describe('a palette change reaches every token reader (#631)', () => {
  it('finds a component that reads TYPE without subscribing (the check itself)', () => {
    const file = { file: 'x.tsx', text: 'function Row() { return <Text style={TYPE.body} />; }' };
    expect(unsubscribed(file)).toEqual(['x.tsx Row']);
    const kept = { ...file, text: file.text.replace('{ return', '{ useTheme(); return') };
    expect(unsubscribed(kept)).toEqual([]);
  });

  it('has every component that reads TYPE or SHADOW subscribe to the theme', () => {
    const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];
    expect(app.flatMap(unsubscribed)).toEqual([]);
  });
});
