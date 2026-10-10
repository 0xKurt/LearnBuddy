import { z } from 'zod';

// Buddy's voice: speech to text and text to speech (ADR 0008). Generic — every Buddy talks and
// listens, whatever it teaches; the learning domain (speaking questions, rehearsals) builds on
// these, never the other way round (issue #107).

/** The recording formats the app uploads (m4a/aac on the phones, webm or wav in a browser). */
export const AudioMime = z.enum([
  'audio/mp4',
  'audio/aac',
  'audio/m4a',
  'audio/webm',
  'audio/wav',
  'audio/mpeg',
]);
export type AudioMime = z.infer<typeof AudioMime>;

/**
 * Speech to text: a spoken chat message or answer. A dictation has no time limit
 * (issue #19): the app cuts a long recording into pieces at pauses and sends them
 * one after another, each as its own request. No recording is stored.
 */
export const TranscribeRequest = z.object({
  mime: AudioMime,
  /** One piece. The bound is transport, not a time limit: the app cuts well below it. */
  audio_base64: z.string().min(100).max(2_000_000),
  /** message: talking to Buddy · answer: answering a question (numbers and math written as such). */
  purpose: z.enum(['message', 'answer']),
  /** The language she is expected to speak (e.g. 'fr' for a French answer); null = the app language. */
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .optional(),
  /** answer: the question being answered, so short answers ("drei Viertel") are heard in context. */
  context: z.string().max(600).nullable().optional(),
  /**
   * The tail of what the same dictation's earlier pieces already said, so a piece
   * that starts mid-sentence is heard as its continuation. Context only: the model
   * never repeats it. Absent on the first (or only) piece.
   */
  prev_tail: z.string().max(400).nullable().optional(),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequest>;

export const TranscribeResponse = z.object({
  /** What was said, written down; empty when nothing understandable was heard. */
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

/**
 * POST /voice/transcribe with `Accept: text/event-stream` (issue #9): `progress`
 * events while the model is still writing down what it heard, then one `done` event
 * with the TranscribeResponse (or `error` with { code }). Progress is only for showing
 * the words as they arrive; what is sent off is what `done` carries.
 */
export const TranscribeStreamEvent = z.object({
  /** What was said, as far as it is written down; '' before the first words. */
  text: z.string(),
});
export type TranscribeStreamEvent = z.infer<typeof TranscribeStreamEvent>;

// ─────────────── Buddy's voice (text to speech, ADR 0008) ───────────────

/**
 * The small curated set of Buddy's voices (ADR 0008): she picks one in the setup or the
 * settings (tap to hear it), or asks Buddy ("andere Stimme"). The server maps each to a
 * provider voice; the app shows only friendly names, never the provider's.
 */
// How each sits is said in the picker's line under its name (`voice_pick.about`, issue #526):
// higher = Chirp 3 HD Sulafat, Zephyr, Aoede (warm, bright, soft); lower = Achird, Iapetus,
// Charon (friendly, clear, deep) — `apps/api/src/speech/google.ts`. Said as pitch, not as a
// person: a synthetic voice has no gender to claim.
export const VOICE_NAMES = ['warm', 'friendly', 'bright', 'clear', 'soft', 'deep'] as const;
export const VoiceName = z.enum(VOICE_NAMES);
export type VoiceName = z.infer<typeof VoiceName>;

/** Speaking speed in steps: -2 much slower … 0 normal … +2 much faster. */
export const VOICE_SPEED_MIN = -2;
export const VOICE_SPEED_MAX = 2;
export const VoiceSpeed = z.number().int().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX);

/**
 * One sentence (or a short word) to be read aloud in Buddy's natural voice. The app sends
 * only the text as it is spoken (math already in words, lib/speech/spoken.ts) — nothing else
 * about her. Voice and speed come from her settings on the server (a preview may name a voice).
 */
export const SpeechRequest = z.object({
  text: z.string().trim().min(1).max(600),
  /** BCP 47 locale the text is read in ("de-DE", "fr-FR"). */
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  /** "Langsam": the slower speed for listening closely (vocabulary). */
  slow: z.boolean().optional(),
  /**
   * Read in this voice instead of hers — only the voice picker's "tap to hear" preview. Her
   * settings stay as they are; choosing a voice is PATCH /buddy/settings.
   */
  voice: VoiceName.optional(),
});
export type SpeechRequest = z.infer<typeof SpeechRequest>;

export const SpeechResponse = z.object({
  mime: z.enum(['audio/mpeg', 'audio/wav']),
  audio_base64: z.string().min(1),
  voice: VoiceName,
  speed: VoiceSpeed,
});
export type SpeechResponse = z.infer<typeof SpeechResponse>;
