// What a long text (Aufsatz, Erörterung, Interpretation — issue #258) changes on the one practice
// screen, decided by code from the question's kind (CLAUDE.md rule 16: she never picks a form).
// Pure: the screen and its parts render it. docs/architecture.md §Practice („Lange Texte").
//
//   · the field takes up to `ESSAY_TEXT_MAX` characters (every other answer `ANSWER_TEXT_MAX`) —
//     the server holds the same numbers (422 beyond);
//   · her text stays in the field after she sent it: a new version starts from the one she has
//     (the server gives feedback on up to `ESSAY_VERSIONS_MAX`), and the per-session draft keeps
//     it across leaving the screen and an app kill (`useDraft`);
//   · in the conversation a version stands as one line ("Fassung 1 · 412 Wörter") — her whole
//     text as a bubble would push everything else out, and it is in the field anyway;
//   · there is no solution to show (a free text has none), so the way past it is "Überspringen";
//     nothing was judged right or wrong, so there is nothing to dispute (the server says 409).

import {
  ANSWER_TEXT_MAX,
  ESSAY_TEXT_MAX,
  type ItemKind,
  type ItemView,
  type PracticeTurnView,
} from '@learnbuddy/shared-types/contracts';

/** How many characters her answer to a question of this kind may have. */
export function answerMax(kind: ItemKind): number {
  return kind === 'essay' ? ESSAY_TEXT_MAX : ANSWER_TEXT_MAX;
}

/**
 * A free text: no solution to show, and the way past it says so ("Überspringen", #197). A program
 * or a query she writes is no free text (#262): its solution was run against her tests and is shown.
 */
export function freeText(item: Pick<ItemView, 'kind' | 'code'>): boolean {
  return !item.code && (item.kind === 'long' || item.kind === 'essay');
}

/**
 * What stays in the field once her answer was sent: a long text stays — her next version starts
 * from it — and so does code (#262): she fixes her program, she does not type it again. Any other
 * answer clears, unless she has typed on meanwhile.
 */
export function leftAfterSend(
  current: string,
  sent: string,
  item: Pick<ItemView, 'kind' | 'code'> | undefined,
): string {
  if (item?.kind === 'essay' || item?.code) return current;
  return current.trim() === sent ? '' : current;
}

/** Her words, counted the way a teacher counts them: what stands between spaces. */
export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/u);
  return words[0] === '' ? 0 : words.length;
}

/**
 * Which version each of her answers is (1, 2, 3), by turn id: an answer counts as a version when
 * Buddy's reply to it carries feedback — the same rule the server counts tries by. One the model
 * could not read (an outage) is no version and gets no number.
 */
export function versionsOf(turns: readonly PracticeTurnView[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  turns.forEach((turn, i) => {
    if (turn.role === 'learner' && turns[i + 1]?.essay) out.set(turn.id, out.size + 1);
  });
  return out;
}
