// Reading a reply aloud while it is still being written (docs/architecture.md
// §Speed): each sentence is spoken as soon as it is complete, the rest once the
// reply is done. Pure (unit-tested): where the next complete sentences end.

/**
 * The sentences of `text` after position `from` that are complete — ended by
 * . ! ? … or a line break, followed by a space — and the position up to which
 * they reach. With `done`, whatever is left counts as the last sentence.
 * "z. B." and "3.5" never end a sentence (one letter before the dot / no space after it).
 */
export function nextSentences(
  text: string,
  from: number,
  done: boolean,
): { parts: string[]; upTo: number } {
  const parts: string[] = [];
  let start = from;
  const end = /[.!?…]+["“”»)]?(?=\s)|\n/g;
  end.lastIndex = from;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const stop = m.index + m[0].length;
    if (m[0] !== '\n' && /(?:^|[\s(„"])\p{L}$/u.test(text.slice(start, m.index))) continue;
    const part = text.slice(start, stop).trim();
    if (part) parts.push(part);
    start = stop;
  }
  if (done) {
    const rest = text.slice(start).trim();
    if (rest) parts.push(rest);
    start = text.length;
  }
  return { parts, upTo: start };
}
