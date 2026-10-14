// A press never changes the native view tree (issue #631). Read from the source like
// `headerShell.test.ts`.
//
// On Android, Fabric flattens a `View` that only lays out (no colour, border, opacity, transform)
// into its parent. A press look that is `{}` at rest and a scale or dim while pressed
// (`pressedStyle`, `lib/theme/components.ts`) therefore made the face a real view on press-in and
// flattened it away again on press-out, which moves its children (the label) to another native
// parent. When that move lands in the same commit as the screen leaving — X on a running
// practice, X in Talk, a theme tap that remounts the tree — react-native-screens has already
// marked the outgoing views as transitioning, Android keeps their old parent, and the insert
// throws "The specified child already has a parent" (react-native-screens#4677). The app died
// on the phone (device check 14.10.2026).
//
// So a `View` whose style reads `pressed` keeps its own native view in every state:
// `collapsable={false}`.

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

const VIEW_TAGS = new Set(['View', 'Animated.View']);

function mentionsPressed(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text === 'pressed') return true;
  return node.forEachChild(mentionsPressed) ?? false;
}

/** Every View whose style depends on `pressed` but may still be flattened, as `file:line`. */
function collapsiblePressFaces(source: Source): string[] {
  if (!source.text.includes('pressed')) return [];
  const tree = ts.createSourceFile(
    source.file,
    source.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: string[] = [];
  (function walk(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      VIEW_TAGS.has(node.tagName.getText())
    ) {
      let pressStyled = false;
      let kept = false;
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText();
        const value = attribute.initializer;
        const given =
          value !== undefined && ts.isJsxExpression(value) ? value.expression : undefined;
        if (name === 'style' && given !== undefined && mentionsPressed(given)) pressStyled = true;
        if (name === 'collapsable' && given?.kind === ts.SyntaxKind.FalseKeyword) kept = true;
      }
      if (pressStyled && !kept)
        out.push(`${source.file}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    node.forEachChild(walk);
  })(tree);
  return out;
}

describe('a press keeps the native view tree (#631)', () => {
  it('finds a flattenable press face (the check itself)', () => {
    const face = {
      file: 'x.tsx',
      text: `const a = <Pressable>{({ pressed }) => <View style={{ ...pressedStyle(pressed, r) }} />}</Pressable>;`,
    };
    expect(collapsiblePressFaces(face)).toEqual(['x.tsx:1']);
    const kept = { ...face, text: face.text.replace('<View ', '<View collapsable={false} ') };
    expect(collapsiblePressFaces(kept)).toEqual([]);
  });

  it('gives every View styled by `pressed` its own native view', () => {
    const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];
    expect(app.flatMap(collapsiblePressFaces)).toEqual([]);
  });
});
