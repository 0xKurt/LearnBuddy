// The judged words of a spoken sentence as the sentence writes them (#599 correction). The
// judgement names the words alone ("today"), in the sentence's order (`judgementFault`,
// apps/api/src/modules/practice/speak.ts); the sentence she was asked to say also has its signs
// ("today."). The card shows the words — so the final stop was gone once it was judged. Pure:
// which signs stand directly at each judged word in the sentence, so the card can write them back
// beside it, outside the mark.

/** What stands directly before and after a word in the sentence, without a space between. */
export type Signs = { before: string; after: string };

const NONE: Signs = { before: '', after: '' };
/** A written word's signs and its core: letters, marks and digits, with what joins them inside. */
const WRITTEN = /^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/su;

const plain = (text: string) => text.normalize('NFC').replace(/[‘’ʼ]/g, "'");
const sameWord = (a: string, b: string) =>
  plain(a).localeCompare(plain(b), undefined, { sensitivity: 'base' }) === 0;

/**
 * One entry per judged word, in their order. A word is looked for from where the last one was
 * found, case and accents aside (as the server compares them); one the sentence does not hold
 * gets no signs, and the search goes on from the same place.
 */
export function signsAround(sentence: string, words: ReadonlyArray<{ text: string }>): Signs[] {
  const written = sentence
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => WRITTEN.exec(part) ?? ['', '', part, '']);
  let from = 0;
  return words.map((word) => {
    const at = written.findIndex((w, i) => i >= from && sameWord(w[2] ?? '', word.text));
    if (at < 0) return NONE;
    from = at + 1;
    return { before: written[at]?.[1] ?? '', after: written[at]?.[3] ?? '' };
  });
}

// ─────────────── the tappable words (#625) ───────────────
// The words stand at normal text spacing, so a short word ("is") is narrower than a finger. Its
// touch area reaches out to the target size around it and overlaps its neighbours'; where they
// overlap, the press goes to the word nearest to where the finger came down — never to the one
// whose area merely lies on top.

/** A word's box in the sentence, in the coordinates its row lays it out in. */
export type WordBox = { x: number; y: number; width: number; height: number };

/** How far a word's touch area reaches past its box on each side, to be `target` across. */
export function touchReach(box: WordBox | undefined, target: number): { x: number; y: number } {
  if (!box) return { x: 0, y: 0 };
  return {
    x: Math.max(0, (target - box.width) / 2),
    y: Math.max(0, (target - box.height) / 2),
  };
}

const distance = (p: { x: number; y: number }, b: WordBox) =>
  Math.hypot(
    Math.max(b.x - p.x, 0, p.x - (b.x + b.width)),
    Math.max(b.y - p.y, 0, p.y - (b.y + b.height)),
  );

/**
 * Which word a press at `point` means: the one whose box is nearest (inside it is nearest). A
 * tie, or boxes not laid out yet, keep the word whose area was pressed (`own`).
 */
export function nearestWord(
  point: { x: number; y: number },
  boxes: ReadonlyArray<WordBox | undefined>,
  own: number,
): number {
  const ownBox = boxes[own];
  let best = own;
  let bestDistance = ownBox ? distance(point, ownBox) : Infinity;
  boxes.forEach((box, i) => {
    if (!box || i === own) return;
    const d = distance(point, box);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}
