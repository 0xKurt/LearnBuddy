// Der Lexer der Lehr-Teilmenge von Python (issue #262).
//
// Er ist der erste Teil eines Interpreters, der NICHTS ausführt außer seinem eigenen Baum:
// kein `eval`, kein `Function`, kein `import`, kein Zugriff auf irgendein Objekt des Servers.
// Warum es ein eigener Interpreter ist und keine Sandbox um ein echtes Python, steht in
// `docs/architecture.md` §Informatik (Bedrohungsmodell). Hier nur: was er nicht kennt, lehnt er
// mit einem benannten Grund ab — er rät nie, was eine Zeile bedeuten könnte.

import { PyError } from './errors.js';

/** Die längste Quelle, die gelesen wird — eine Schulaufgabe, kein Projekt. */
export const SOURCE_MAX_CHARS = 2000;
/** Die meisten Zeilen einer Quelle. */
export const SOURCE_MAX_LINES = 60;

export type TokKind =
  | 'name'
  | 'int'
  | 'float'
  | 'str'
  | 'op'
  | 'newline'
  | 'indent'
  | 'dedent'
  | 'eof';

export type Token = {
  kind: TokKind;
  /** Der Text des Tokens; bei `str` der Inhalt NACH dem Auflösen der Escapes. */
  text: string;
  /** Nur bei `str`: ein f-String (`f"…{x}…"`), dessen Teile der Parser zerlegt. */
  fstring?: boolean;
  /** Bei einem f-String: der rohe Inhalt, damit `{…}` und `\{` auseinanderzuhalten sind. */
  raw?: string;
  line: number;
};

/** Python-Schlüsselwörter. Die nicht unterstützten kommen bis zum Parser und werden dort benannt. */
export const KEYWORDS: ReadonlySet<string> = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

/** Die Operatoren, längste zuerst, damit `//=` nicht als `/` `/=` gelesen wird. */
const OPS = [
  '**=',
  '//=',
  '>>=',
  '<<=',
  '->',
  '**',
  '//',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
  ':=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '=',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ':',
  '.',
  ';',
  '&',
  '|',
  '^',
  '~',
  '@',
];

const NAME_START = /[\p{L}_]/u;
const NAME_PART = /[\p{L}\p{N}_]/u;

/**
 * Prüft, was an der Quelle als Ganzes nicht stimmen darf, bevor ein Zeichen gelesen wird.
 *
 * Zeichen außerhalb der Basic Multilingual Plane (Emoji) werden abgelehnt, nicht „ungefähr"
 * behandelt: JavaScript zählt sie als zwei Zeichen, Python als eins — `len("🎉")` wäre hier 2
 * und in echtem Python 1. Ein Interpreter, der in diesem Punkt anders rechnet als Python, würde
 * einem Kind eine falsche Ausgabe als richtig beibringen. Also gibt es diese Programme nicht.
 */
export function checkSource(source: string): string {
  const text = source.replace(/\r\n?/g, '\n');
  if (text.length > SOURCE_MAX_CHARS) throw new PyError('too_long', 1);
  if (text.split('\n').length > SOURCE_MAX_LINES) throw new PyError('too_long', 1);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) {
      throw new PyError('unsupported', lineAt(text, i), 'emoji');
    }
    if (c < 0x20 && c !== 0x0a && c !== 0x09) throw new PyError('syntax', lineAt(text, i));
  }
  return text;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * Die Breite einer Einrückung. Ein Tab zählt vier Spalten — nachsichtiger als Python, das
 * gemischte Einrückung ablehnt; auf einem Handy tippt niemand bewusst einen Tab, und eine
 * Tastatur, die einen einfügt, soll kein Kind mit einem `TabError` bestrafen.
 */
function indentWidth(ws: string): number {
  let w = 0;
  for (const ch of ws) w += ch === '\t' ? 4 : 1;
  return w;
}

/** Die Escapes, die ein String kennt. Ein unbekannter bleibt wörtlich, wie in Python. */
const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  '\\': '\\',
  "'": "'",
  '"': '"',
  r: '\r',
  '0': '\0',
};

/**
 * Zerlegt die Quelle in Tokens mit INDENT/DEDENT, wie Python sie sieht.
 *
 * `curly` erlaubt typografische Anführungszeichen („“ ‚‘ “” ‘’) als String-Grenzen. Das gilt nur
 * für ihre EIGENE Antwort (eine Handytastatur setzt sie von selbst ein), nie für das, was das
 * Modell schreibt — dort heißt ein solches Zeichen, dass das Programm kein Python ist.
 */
export function lex(source: string, curly = false): Token[] {
  const text = checkSource(source);
  const out: Token[] = [];
  const indents: number[] = [0];
  // Offene Klammern mit ihrer Zeile: innerhalb von (), [] und {} zählen Zeilenumbrüche nicht, und
  // eine, die nie geschlossen wird, ist ein Fehler in IHRER Zeile, nicht am Ende der Datei.
  const open: number[] = [];
  let i = 0;
  let line = 1;
  let atLineStart = true;

  const push = (kind: TokKind, t: string, extra: Partial<Token> = {}) =>
    out.push({ kind, text: t, line, ...extra });

  while (i < text.length) {
    if (atLineStart && open.length === 0) {
      // Eine Zeile beginnt: Einrückung messen; leere und reine Kommentarzeilen zählen nicht.
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
      const rest = text[j];
      if (rest === undefined || rest === '\n' || rest === '#') {
        while (j < text.length && text[j] !== '\n') j++;
        if (j < text.length) {
          j++;
          line++;
        }
        i = j;
        continue;
      }
      const width = indentWidth(text.slice(i, j));
      const top = indents[indents.length - 1] ?? 0;
      if (width > top) {
        indents.push(width);
        push('indent', '');
      } else {
        while (width < (indents[indents.length - 1] ?? 0)) {
          indents.pop();
          push('dedent', '');
        }
        if (width !== (indents[indents.length - 1] ?? 0)) throw new PyError('indent', line);
      }
      i = j;
      atLineStart = false;
      continue;
    }
    const ch = text[i] as string;
    if (ch === '\n') {
      if (open.length === 0) {
        push('newline', '');
        atLineStart = true;
      }
      line++;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '\\') throw new PyError('unsupported', line, 'backslash');
    // Zahlen
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const m = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
      const lit = m?.[0] ?? ch;
      const next = text[i + lit.length] ?? '';
      if (/[\p{L}_]/u.test(next)) {
        // `0x1F`, `1_000`, `3j`: echtes Python, aber nicht Teil dieser Teilmenge.
        throw new PyError(/[xXoObBjJ_]/.test(next) ? 'unsupported' : 'syntax', line, 'number');
      }
      const isFloat = /[.eE]/.test(lit);
      if (!isFloat && lit.length > 1 && lit.startsWith('0') && /[1-9]/.test(lit)) {
        throw new PyError('syntax', line); // 012 ist in Python 3 ein Syntaxfehler
      }
      push(isFloat ? 'float' : 'int', lit);
      i += lit.length;
      continue;
    }
    // Strings (mit optionalem f-Präfix)
    const prefixed = (ch === 'f' || ch === 'F') && isQuote(text[i + 1] ?? '', curly);
    if (isQuote(ch, curly) || prefixed) {
      const start = prefixed ? i + 1 : i;
      const open = text[start] as string;
      if (text.slice(start, start + 3) === open.repeat(3) && (open === '"' || open === "'")) {
        throw new PyError('unsupported', line, 'triple_quote');
      }
      let j = start + 1;
      let value = '';
      let raw = '';
      for (;;) {
        const c = text[j];
        if (c === undefined || c === '\n') throw new PyError('syntax', line);
        if (closes(open, c, curly)) break;
        if (c === '\\') {
          const e = text[j + 1];
          if (e === undefined || e === '\n') throw new PyError('syntax', line);
          raw += c + e;
          value += ESCAPES[e] ?? `\\${e}`;
          j += 2;
          continue;
        }
        raw += c;
        value += c;
        j++;
      }
      push('str', value, prefixed ? { fstring: true, raw } : {});
      i = j + 1;
      continue;
    }
    if (NAME_START.test(ch)) {
      let j = i + 1;
      while (j < text.length && NAME_PART.test(text[j] as string)) j++;
      const word = text.slice(i, j);
      // Ein anderes String-Präfix (r"", b"", u"") ist echtes Python und hier nicht dabei.
      if (
        /^(?:[rRbBuU]|[rR][bB]|[bB][rR]|[fF][rR]|[rR][fF])$/.test(word) &&
        isQuote(text[j] ?? '', false)
      ) {
        throw new PyError('unsupported', line, 'string_prefix');
      }
      push('name', word);
      i = j;
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op) {
      if (op === '(' || op === '[' || op === '{') open.push(line);
      if (op === ')' || op === ']' || op === '}') {
        if (open.length === 0) throw new PyError('syntax', line);
        open.pop();
      }
      push('op', op);
      i += op.length;
      continue;
    }
    throw new PyError('syntax', line);
  }
  if (open.length > 0) throw new PyError('syntax', open[open.length - 1] ?? line);
  if (!atLineStart) push('newline', '');
  while (indents.length > 1) {
    indents.pop();
    push('dedent', '');
  }
  push('eof', '');
  return out;
}

const CURLY_OPEN = new Set(['“', '”', '„', '‘', '’', '‚']);

function isQuote(c: string, curly: boolean): boolean {
  return c === '"' || c === "'" || (curly && CURLY_OPEN.has(c));
}

function closes(open: string, c: string, curly: boolean): boolean {
  if (!curly) return c === open;
  const double = ['"', '“', '”', '„'];
  const single = ["'", '‘', '’', '‚'];
  return double.includes(open) ? double.includes(c) : single.includes(open) && single.includes(c);
}
