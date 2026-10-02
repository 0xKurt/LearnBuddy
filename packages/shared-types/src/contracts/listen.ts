// Hörverstehen: a question whose stimulus is SPOKEN instead of written (issue #210).
//
// This is not a second speech stack. The text-to-speech seam, the voice, the speed, the
// 24-hour audio cache and the "Langsam" pass have existed since ADR 0008 and are used
// exactly as they are (`apps/api/src/modules/voice/speech.ts`). What was missing was a
// question that is answered from HEARING: in a class test in English, French or Spanish
// listening is its own competence, in NRW it has to appear in a written test once a year,
// and a child could not practise it here at all.
//
// Three decisions this contract makes, and why:
//
//   1. The spoken text NEVER reaches the app. It is the source every answer comes from, so
//      sending it with the question would put the solution on the device — and the sheet's
//      own rule is that she reads the text only once she has answered (issue #210, point 2).
//      So the app asks for AUDIO (`ListenAudioRequest`) and gets audio; the words follow as
//      `SessionItemView.listen_transcript` once the question is closed.
//   2. The answer forms are the ones that already exist. A listening question is an ordinary
//      `multiple_choice` or `short` item with a spoken stimulus — graded by the same rules,
//      scheduled by the same spaced repetition, shown on the same card. A comprehension
//      answer in free text is not mechanically decidable, and #197 and #227 are two tickets'
//      worth of what happens when code pretends otherwise.
//   3. Hearing it again is part of the form, not an extra. In a class test the text is played
//      twice; in practice there is no reason to stop her at two, so there is no count here —
//      the app may ask for the audio as often as she taps, and the slower pass is the same
//      request with `slow`.

import { z } from 'zod';

import { Uuid } from './common.js';

/**
 * The longest a listening text may be. It is exactly `SpeechRequest`'s own bound, because
 * this text IS a speech request: one synthesis call, one recording, no stitching together of
 * pieces whose seams she would hear. 600 characters is about 45 seconds spoken — the length
 * of a listening item in a lower-secondary class test.
 */
export const MAX_LISTEN_CHARS = 600;

/**
 * The shortest. Under this there is nothing to understand — a single sentence is a vocabulary
 * question read aloud, which `speak` and the "Anhören" pill already cover.
 */
export const MIN_LISTEN_CHARS = 80;

/** The most questions one listening text may carry: a class test asks three to five. */
export const MAX_LISTEN_QUESTIONS = 5;

/**
 * The spoken stimulus of one question, as stored on the question itself
 * (`items.listen_task`, migration 0077).
 *
 * `text` is passed to the speech gateway verbatim — not a summary of it, not a version of
 * it the model wrote for the screen. That is the one rule the whole form rests on (issue
 * #210, "Regel 0"): if the text that is READ and the text the questions were written from
 * could differ, every answer would be checked against something she never heard.
 *
 * It is stored per question, not once per set, on purpose: spaced repetition may bring one
 * question back alone in three weeks, and a question whose text lives somewhere else is then
 * unanswerable. A question carries everything it needs to be asked.
 */
export const ListenTask = z.object({
  /** Exactly what the speech gateway is given. Never shown while the question is open. */
  text: z.string().trim().min(1).max(MAX_LISTEN_CHARS),
  /** The language it is spoken in (ISO 639-1), which decides the voice's locale. */
  lang: z.string().regex(/^[a-z]{2}$/),
});
export type ListenTask = z.infer<typeof ListenTask>;

/**
 * What the app is told about a question's spoken stimulus (`ItemView.listen`): that there is
 * one, and which one — never its words.
 *
 * `ref` is an alias the server issues from the position in the view ('h1', 'h2', …), like
 * every other alias in this API (CLAUDE.md rule 2). Questions about the SAME text share it,
 * which is the one thing the app cannot work out for itself and needs: three questions about
 * one recording are one listening task, so the second question offers "nochmal hören" rather
 * than pretending a new text is coming.
 */
export const ListenRef = z.object({
  ref: z.string().regex(/^h[1-9][0-9]*$/),
});
export type ListenRef = z.infer<typeof ListenRef>;

/**
 * POST /practice/sessions/:id/listen — the recording of one question's listening text.
 *
 * The request names the question, never the text: the words stay on the server. Answered with
 * audio from the same cache every other spoken sentence uses, so hearing it again costs
 * nothing (`modules/voice/speech.ts`).
 */
export const ListenAudioRequest = z.object({
  item_id: Uuid,
  /** "Langsamer": the same recording at the slower speed for listening closely. */
  slow: z.boolean().optional(),
});
export type ListenAudioRequest = z.infer<typeof ListenAudioRequest>;

export const ListenAudioResponse = z.object({
  mime: z.enum(['audio/mpeg', 'audio/wav']),
  audio_base64: z.string().min(1),
});
export type ListenAudioResponse = z.infer<typeof ListenAudioResponse>;
