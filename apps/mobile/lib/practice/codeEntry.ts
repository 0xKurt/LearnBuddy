// Code auf einer Handytastatur schreiben (issue #262).
//
// In Python IST die Einrückung die Struktur, und genau sie ist auf einem Handy am mühsamsten:
// vier Leerzeichen, viermal getippt, in jeder Zeile eines Schleifenrumpfs. Zwei kleine Hilfen,
// beide so, wie jeder Code-Editor sie hat, und beide nur Tipparbeit, nie Inhalt:
//   · eine neue Zeile übernimmt die Einrückung der Zeile davor, und nach einem Doppelpunkt
//     (`for …:`, `if …:`, `def …:`) eine Stufe mehr;
//   · „Einrücken" setzt vier Leerzeichen an die Stelle des Cursors.
// Ausrücken bleibt die Rücktaste — eine dritte Taste wäre mehr Oberfläche als Hilfe.

/** Eine Einrückungsstufe: vier Leerzeichen, wie PEP 8 und jedes Schulbuch. */
export const INDENT = '    ';

export type Edit = { text: string; caret: number };

/**
 * War die Änderung von `prev` zu `next` genau ein eingefügter Zeilenumbruch? Dann die neue Zeile
 * mit passender Einrückung — sonst null, und die Eingabe bleibt, wie sie getippt wurde.
 */
export function autoIndent(prev: string, next: string): Edit | null {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  if (next[i] !== '\n' || next.slice(i + 1) !== prev.slice(i)) return null;
  // Mehrere Umbrüche hintereinander lassen nicht erkennen, an welchem getippt wurde; gemeint ist
  // fast immer das Ende der Zeile mit Inhalt, also der früheste.
  while (i > 0 && prev[i - 1] === '\n') i--;
  const lineStart = prev.lastIndexOf('\n', i - 1) + 1;
  const line = prev.slice(lineStart, i);
  const own = /^ */.exec(line)?.[0] ?? '';
  const indent = line.trimEnd().endsWith(':') ? own + INDENT : own;
  if (indent === '') return null;
  return { text: `${prev.slice(0, i)}\n${indent}${prev.slice(i)}`, caret: i + 1 + indent.length };
}

/** Vier Leerzeichen an der Stelle des Cursors (eine Auswahl wird ersetzt). */
export function indentAt(text: string, selection: { start: number; end: number } | null): Edit {
  const start = selection ? Math.min(selection.start, selection.end) : text.length;
  const end = selection ? Math.max(selection.start, selection.end) : text.length;
  return {
    text: `${text.slice(0, start)}${INDENT}${text.slice(end)}`,
    caret: start + INDENT.length,
  };
}

/** Hat sie über den vorgegebenen Anfang hinaus etwas geschrieben? Sonst gibt es nichts zu prüfen. */
export function wroteSomething(value: string, starter: string): boolean {
  return value.trim().length > 0 && value.trim() !== starter.trim();
}
