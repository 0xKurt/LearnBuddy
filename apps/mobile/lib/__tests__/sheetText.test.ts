// A sheet's words start on one edge (#599): its title stands 4 pt in from the sheet's side
// (design `components/core/Sheet.jsx:11`), and so does every loose line of text under it (`Lead`,
// `ui_kits/app/More.jsx:13`) — `SHEET_TEXT` from `components/lb/Sheet.tsx`. A list, a card, a
// field or a button keeps the full width. Read from the source, like `oneInput.test.ts`: a new
// line of text in a sheet without the inset is red here, and so is a new kind of part that
// nobody has decided about.
//
// What it reads: every `<Sheet>` in `app/` and `components/`, everything inside it (not its
// props — a `footer` is not in the sheet's column), and the components of the same file that
// stand loose in it. A component from another file cannot be read here: it has to be in `PARTS`
// with the reason it needs no inset — or stand inside a View that carries `SHEET_TEXT`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

/** Words. */
const TEXT = new Set(['Text', 'MathText', 'InlineText', 'AppearText']);
/** Boxes that only lay out: what is inside them is still loose in the sheet. */
const LAYOUT = new Set(['View', 'PressArea', 'Appear', 'Rise', 'Animated.View']);

/**
 * Parts from other files that may stand loose in a sheet at its full width, and why. A part that
 * is words only is not here: it goes into a View with `SHEET_TEXT` at its call site.
 */
const PARTS: Record<string, string> = {
  Btn: 'a button',
  ListenButton: 'a button',
  MicButton: 'a button',
  LbTextInput: 'a field; its own label is 4 in already (components/core/Field.jsx)',
  NewPasswordFields: 'fields with their own labels',
  BirthDateFields: 'fields with their own labels',
  ChoiceOptions: 'a column of buttons',
  ListGroup: 'rows on a paper card',
  Card: 'a card',
  ErrorNote: 'a tinted card',
  SkeletonGroup: 'placeholders in the shape of the rows that arrive',
  StartStatus: 'a row that begins with its spinner, or a banner',
  BusyIndicator: 'a mark',
  FieldCount: 'a count at the end of its line, not at the start',
  QuestionCorner: 'a button (its confirmation is a sheet of its own)',
};

/**
 * Words that stand where they do on purpose (file → how many, and why). Only shrinks:
 * `tools/guards/no-growth.mjs` compares it with main (`tools/guards/source-lists.mjs`).
 */
const PLACED: Record<string, { count: number; why: string }> = {
  'components/practice/WordSheet.tsx': {
    count: 1,
    why: '"Ich höre zu …" follows its spinner in one row; the spinner is on the edge',
  },
  'components/settings/LicencesSheet.tsx': {
    count: 1,
    why: 'a licence text under its own row, at the row’s inset',
  },
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

type Element = ts.JsxElement | ts.JsxSelfClosingElement;
const isElement = (node: ts.Node): node is Element =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
const opening = (node: Element) => (ts.isJsxElement(node) ? node.openingElement : node);
const tagOf = (node: Element) => opening(node).tagName.getText();
const inset = (node: Element) => /\bSHEET_TEXT\b/.test(opening(node).attributes.getText());

type Finding = { file: string; line: number; what: string };

function sheetFindings(path: string): { loose: Finding[]; parts: Finding[] } {
  const text = readFileSync(path, 'utf8');
  const loose: Finding[] = [];
  const parts: Finding[] = [];
  if (!/<Sheet\b/.test(text)) return { loose, parts };
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = relative(ROOT, path);
  const at = (node: ts.Node, what: string): Finding => ({
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    what,
  });
  /** The components this file declares itself: they are read where a sheet uses them. */
  const own = new Map<string, ts.Node>();
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
      own.set(node.name.text, node.body);
  });
  const read = new Set<string>();

  /** Walks what stands in a sheet's column; `set` is true inside a box that carries the inset. */
  function column(node: ts.Node, set: boolean): void {
    if (ts.isJsxAttributes(node)) return;
    if (isElement(node)) {
      const tag = tagOf(node);
      if (TEXT.has(tag)) {
        if (!set && !inset(node)) loose.push(at(node, `<${tag}>`));
        return;
      }
      if (!LAYOUT.has(tag)) {
        if (set) return;
        const body = own.get(tag);
        if (body) {
          if (!read.has(tag)) {
            read.add(tag);
            column(body, false);
          }
        } else if (!(tag in PARTS)) parts.push(at(node, `<${tag}>`));
        return;
      }
      set = set || inset(node);
    }
    node.forEachChild((child) => column(child, set));
  }

  (function find(node: ts.Node): void {
    if (isElement(node) && tagOf(node) === 'Sheet')
      node.forEachChild((child) => column(child, false));
    else node.forEachChild(find);
  })(source);
  return { loose, parts };
}

const found = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))].map(
  sheetFindings,
);
const say = (f: Finding) => `${f.file}:${f.line} ${f.what}`;

describe('a sheet’s words start on its title’s edge (#599, components/core/Sheet.jsx:11)', () => {
  it('gives every loose line of text in a sheet the sheet’s text inset', () => {
    const loose = found.flatMap((f) => f.loose);
    const beyond = Object.entries(
      loose.reduce<Record<string, Finding[]>>((by, f) => {
        (by[f.file] ??= []).push(f);
        return by;
      }, {}),
    )
      .filter(([file, list]) => list.length !== (PLACED[file]?.count ?? 0))
      .flatMap(([, list]) => list.map(say));
    expect(beyond, 'add `SHEET_TEXT` to the text’s style (components/lb/Sheet.tsx)').toEqual([]);
    // A placed line that is gone takes its entry with it.
    for (const [file, { count }] of Object.entries(PLACED)) {
      expect(
        loose.filter((f) => f.file === file),
        file,
      ).toHaveLength(count);
    }
  });

  it('knows every part that stands in a sheet at its full width', () => {
    expect(
      found.flatMap((f) => f.parts).map(say),
      'words only → a View with `SHEET_TEXT` around it; a control or a card → `PARTS`, with why',
    ).toEqual([]);
  });
});
