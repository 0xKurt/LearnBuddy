// Diktat: Buddy reads a word or a sentence aloud, she types it (issue #242).
//
// Spelling practised WITHOUT voice input. That is the whole point of the form, and it decides
// three things this contract fixes for both sides:
//
//   1. The word is never on the screen while the question is open. The question's text is a
//      fixed line the server writes ("Hör zu und schreib das Wort."), and the key reaches the app
//      only once the question is closed — like every other solution (`SessionItemView.answer`).
//      What she has instead is the RECORDING: `ItemView.listen` names it and
//      `POST /practice/sessions/:id/listen` plays it, as often as she taps, also slower. That is
//      the Hörverstehen chain of issue #210, used unchanged; the voice is given the KEY itself,
//      never a text a model rephrased (migration 0081 makes that a database rule).
//   2. Her microphone is off for it. Voice input writes a word the way the recogniser spells
//      it — a spelling exercise answered by speaking would be checked against the recogniser's
//      spelling, not hers. The kind is therefore not called "dictation": in the app that word
//      already IS the voice input (`apps/mobile/lib/speech/dictation.ts`).
//   3. The check is exact and strict — case, ß/ss, punctuation — and decided by code alone. A
//      miss is answered with the PLACE it went wrong ("Doppel-m fehlt", "groß schreiben"),
//      computed from a character diff, with no model (`apps/api/src/modules/practice/dictation.ts`).

/** The item kind (contracts/learning.ts `ItemKind`), named once for both sides. */
export const DICTATION_KIND = 'spelling_dictation' as const;

/**
 * The longest entry: one sentence. A Diktat at primary school is dictated sentence by sentence;
 * a whole paragraph in one recording is a listening task, not spelling practice, and one
 * synthesis call per sentence keeps "nochmal" cheap.
 */
export const MAX_DICTATION_CHARS = 160;

/** The most entries one run holds: a Lernwörter list of a week, not a catalogue. */
export const MAX_DICTATION_ITEMS = 15;

export function isDictationKind(kind: string): boolean {
  return kind === DICTATION_KIND;
}
