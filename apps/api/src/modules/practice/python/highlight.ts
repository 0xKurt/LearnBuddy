// Die Einfärbung eines gezeigten Programms (issue #262).
//
// Sie entsteht auf dem Server, aus denselben Regeln wie der Lexer, und reist als Spannen mit der
// Figur (`CodeFigure.lines`). Die App färbt nur noch nach `kind` mit Farben aus dem Theme — sie
// muss kein Python verstehen, und die beiden können nicht auseinanderlaufen.
//
// Anders als der Lexer wirft sie nie: ein unvollständiges Programm wird trotzdem gezeigt, nur
// eben so gefärbt, wie es dasteht.

import type { CodeSpan, CodeSpanKind } from '@learnbuddy/shared-types/contracts';

import { KEYWORDS } from './lex.js';

/** Eingebaute Namen, die als solche gefärbt werden — die, die ein Schulprogramm aufruft. */
const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'print',
  'len',
  'range',
  'int',
  'float',
  'str',
  'bool',
  'abs',
  'min',
  'max',
  'sum',
  'sorted',
  'list',
  'tuple',
  'dict',
  'enumerate',
  'zip',
  'reversed',
  'round',
  'chr',
  'ord',
  'any',
  'all',
  'repr',
  'input',
]);

const TOKEN =
  /(\s+)|(#.*)|([fF]?(?:"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?))|((?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)|([\p{L}_][\p{L}\p{N}_]*)|(.)/uy;

/** Eine Zeile in gefärbte Spannen; Leerraum bleibt erhalten, damit die Einrückung stimmt. */
function lineSpans(line: string): CodeSpan[] {
  const out: CodeSpan[] = [];
  const push = (text: string, kind: CodeSpanKind) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  TOKEN.lastIndex = 0;
  let prevName: string | null = null;
  for (let m = TOKEN.exec(line); m !== null && m[0] !== ''; m = TOKEN.exec(line)) {
    const [whole, ws, com, s, num, name] = m;
    if (ws !== undefined) push(ws.replace(/\t/g, '    '), 'plain');
    else if (com !== undefined) push(com, 'comment');
    else if (s !== undefined) push(s, 'string');
    else if (num !== undefined) push(num, 'number');
    else if (name !== undefined) {
      const kind: CodeSpanKind = KEYWORDS.has(name)
        ? 'keyword'
        : prevName === 'def'
          ? 'function'
          : BUILTIN_NAMES.has(name)
            ? 'builtin'
            : 'plain';
      push(name, kind);
    } else push(whole, 'plain');
    if (ws === undefined) prevName = name ?? null;
  }
  return out;
}

/** Das ganze Programm, Zeile für Zeile. Leere Zeilen bleiben als leere Zeilen stehen. */
export function highlight(source: string): CodeSpan[][] {
  return source.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map(lineSpans);
}
