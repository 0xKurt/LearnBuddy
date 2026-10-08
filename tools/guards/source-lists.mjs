// The Ausnahmelisten that live in a test's source (issues #296, #310, #395): a list a source test
// names as "only shrinks" is read here, so `no-growth.mjs` can compare it with the base branch
// like every list kept by hand. Without this, a PR could add an entry to
// `OWN_BAR` or `CHECK` in the same change that adds the debt, and both halves of the guard — the
// test and its list — would agree.
//
// Read with the TypeScript parser, never with a pattern over the text: an object literal may be
// formatted any way. A list that cannot be found is an error, not an empty list — a renamed
// constant must not blind the guard.

import tseslint from 'typescript-eslint';

/**
 * @typedef {{ type: string, [key: string]: unknown }} Node
 * @typedef {{ key: string, value: Node }} Entry
 */

/** @param {Node} node @returns {string | null} */
function keyName(node) {
  if (node.type === 'Identifier') return /** @type {string} */ (node.name);
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/**
 * The properties of the top-level `const <name> = { … }` (with or without a type annotation,
 * exported or not).
 * @param {string} source
 * @param {string} name
 * @returns {Entry[]}
 */
export function objectLiteral(source, name) {
  const ast = /** @type {{ body: Node[] }} */ (
    /** @type {unknown} */ (tseslint.parser.parseForESLint(source, { sourceType: 'module' }).ast)
  );
  for (const statement of ast.body) {
    const decl =
      statement.type === 'ExportNamedDeclaration'
        ? /** @type {Node} */ (statement.declaration)
        : statement;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of /** @type {Node[]} */ (decl.declarations)) {
      const id = /** @type {Node} */ (d.id);
      if (id.name !== name) continue;
      let init = /** @type {Node | null} */ (d.init);
      while (
        init !== null &&
        (init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression')
      )
        init = /** @type {Node} */ (init.expression);
      if (init?.type !== 'ObjectExpression')
        throw new Error(`${name} ist kein Objekt-Literal — die Liste muss lesbar bleiben`);
      return /** @type {Node[]} */ (init.properties).map((p) => {
        const key = p.type === 'Property' ? keyName(/** @type {Node} */ (p.key)) : null;
        if (key === null)
          throw new Error(`${name}: nur einfache Schlüssel (kein Spread, kein [berechnet])`);
        return { key, value: /** @type {Node} */ (p.value) };
      });
    }
  }
  throw new Error(`const ${name} = { … } nicht gefunden — Liste umbenannt? Dann auch hier.`);
}

/** @param {Node} node @returns {string | null} the text of a string literal or a plain template */
function stringOf(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && /** @type {Node[]} */ (node.expressions).length === 0)
    return /** @type {{ value: { cooked: string } }[]} */ (node.quasis)
      .map((q) => q.value.cooked)
      .join('');
  return null;
}

/** @param {Node} node @returns {number | null} `count: <n>` of an object value */
function countOf(node) {
  if (node.type !== 'ObjectExpression') return null;
  for (const p of /** @type {Node[]} */ (node.properties)) {
    const v = /** @type {Node} */ (p.value);
    if (
      p.type === 'Property' &&
      keyName(/** @type {Node} */ (p.key)) === 'count' &&
      v.type === 'Literal'
    )
      return typeof v.value === 'number' ? v.value : null;
  }
  return null;
}

/**
 * A list as `entry → size`, the shape `no-growth.mjs` compares: an object value with `count`
 * counts that many, any other entry counts 1. With `only`, entries whose value is not a string
 * passing it are left out (the WEAK routes of the route allowlist).
 * @param {string} source
 * @param {string} name
 * @param {(text: string) => boolean} [only]
 * @returns {Record<string, number>}
 */
export function sourceList(source, name, only) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const { key, value } of objectLiteral(source, name)) {
    if (only !== undefined) {
      const text = stringOf(value);
      if (text === null || !only(text)) continue;
    }
    out[key] = countOf(value) ?? 1;
  }
  return out;
}

/** A route whose reason is thin today (minimalism.test.ts): a WEAK entry is debt, not a reason. */
export const isWeak = (/** @type {string} */ reason) => reason.trimStart().startsWith('WEAK');

/**
 * Every Ausnahmeliste kept in a test's source: file → (source → entry → size). Each is a list the
 * test itself says only shrinks; the test checks the code against it, `no-growth.mjs` checks it
 * against main.
 * @type {Record<string, (source: string) => Record<string, number>>}
 */
export const SOURCE_LISTS = {
  // Bars that are not the input bar yet (#395), with how many each file has.
  'apps/mobile/lib/__tests__/oneBar.test.ts#OWN_BAR': (s) => sourceList(s, 'OWN_BAR'),
  // Owners of the answer shell's parts outside the shell (#310 §3.4).
  'apps/mobile/lib/__tests__/answerShell.test.ts#SPACER': (s) => sourceList(s, 'SPACER'),
  'apps/mobile/lib/__tests__/answerShell.test.ts#CHECK': (s) => sourceList(s, 'CHECK'),
  'apps/mobile/lib/__tests__/answerShell.test.ts#SHADOWED': (s) => sourceList(s, 'SHADOWED'),
  // Routes whose reason the chat could carry (#296): a new route may come with a reason, never
  // with a thin one unseen.
  'apps/mobile/lib/__tests__/minimalism.test.ts#ROUTES(WEAK)': (s) =>
    sourceList(s, 'ROUTES', isWeak),
};

/** "a/b.ts#NAME(…)" → "a/b.ts" */
export const fileOf = (/** @type {string} */ list) => list.slice(0, list.indexOf('#'));
