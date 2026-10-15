// Where on her sheet a question stands, for the tutor (KI-Audit F15, issue #674).
//
// The tutor reads the sheet a question came from, but only `MATERIAL_CHARS` of it. Until #674
// those were always the first characters, so a question from the third page of a long sheet was
// judged without the text it is about. Code now finds the stretch of the sheet the question's
// own words stand in and sends that stretch instead. It is a search for a quotation in the
// learner's own text (like `search_material`'s trigrams), not language understanding: nothing is
// decided from it, it only chooses which part of her sheet the tutor reads (CLAUDE.md rule 3).

/** How much of her sheet the tutor reads around a question. */
export const MATERIAL_CHARS = 4000;

/** How far after a line the question's words are looked for: a task and its own lines. */
const REGION_CHARS = 600;

/** The words of a text that can anchor it: letters and digits, four letters or more, or a number of two digits or more (a single digit is on every line). */
function anchors(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFKC')
      .match(/\p{L}[\p{L}\p{N}]{3,}|\p{N}{2,}/gu) ?? [],
  );
}

/**
 * The part of `sheet` the tutor reads for `question`: the whole sheet when it fits, otherwise the
 * `chars` around the line where most of the question's words stand — starting a quarter before it,
 * so the task's lead-in comes along. Without any of its words on the sheet, its beginning.
 */
export function passageFor(
  sheet: string | null,
  question: string,
  chars: number = MATERIAL_CHARS,
): string | null {
  if (sheet === null || sheet.length <= chars) return sheet;
  const wanted = anchors(question);
  let best = { at: 0, hits: 0 };
  let at = 0;
  for (const line of sheet.split('\n')) {
    const found = anchors(sheet.slice(at, at + REGION_CHARS));
    let hits = 0;
    for (const w of wanted) if (found.has(w)) hits++;
    if (hits > best.hits) best = { at, hits };
    at += line.length + 1;
  }
  if (best.hits === 0) return sheet.slice(0, chars);
  const from = Math.max(0, Math.min(best.at - Math.floor(chars / 4), sheet.length - chars));
  const lineStart = from === 0 ? 0 : sheet.lastIndexOf('\n', from) + 1;
  const text = sheet.slice(lineStart, lineStart + chars);
  return lineStart > 0 ? `… ${text}` : text;
}
