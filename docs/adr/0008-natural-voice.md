# ADR 0008 — Buddy's natural voice, and "sprich langsamer" by asking

- Status: accepted (owner, 2026-09-27), amended 2026-09-28 (§Amendment: a visible picker);
  the real Google call is verified live for German in all four voices (2026-09-28, §Live verification);
  speed steps, the other languages and phone playback are still open
- Date: 2026-09-27
- Builds on: [ADR 0004](0004-proactive-buddy.md) (the model interprets, code enforces),
  [ADR 0005](0005-buddy-tool-platform.md) (act tools from one registry)
- Gap analysis: items 4 (natural voice, speed by asking) and 12 (read along)

## Context

Buddy reads its replies, questions, explanations and feedback aloud with the phone's own voice
(`expo-speech`). In their standard quality the iOS and Android system voices sound tinny, and
the good ("Enhanced") voices exist only if she downloaded them herself. In conversation mode the
voice _is_ the product. The owner asked for a natural, modern voice, and for speed and voice to be
changed by just asking Buddy — not in a new settings screen (CLAUDE.md rule 16).

Constraints:

- Children's data is processed in the EU only (`docs/privacy.md`, `config.ts`).
- The model never decides limits or applies changes itself (rules 1, 4).
- Reading aloud must never stop working: offline, on an error or without the provider she still
  hears the text.

## Options (Google Cloud, EU)

| Option                                                    | Sound                                                                     | EU processing                                                               | Latency / control                                                                                         | Cost (list price)             |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Cloud Text-to-Speech, Chirp 3: HD voices**              | LLM-based, very natural; the same 30 voices in every language             | regional endpoint `eu-texttospeech.googleapis.com`                          | short, one call per sentence; `speakingRate`; no SSML marks → **no word timings**                         | ~$30 per 1 M characters       |
| Gemini TTS (Cloud TTS `gemini-*-tts`, or Vertex AI audio) | as natural, plus style prompts ("sprich ruhig")                           | not confirmed for an EU location when this was written (global/US endpoint) | slower first audio; style by prompt, harder to bound                                                      | higher, billed per token      |
| Cloud TTS Neural2 / WaveNet / Studio                      | clearly better than the phone, clearly worse than Chirp 3 HD / Gemini TTS | EU endpoint                                                                 | SSML marks give word timings                                                                              | $16 (Neural2) – $160 (Studio) |
| A realtime audio model (speech in, speech out)            | natural                                                                   | not EU-confirmed                                                            | would replace the whole turn pipeline (tools, fence, safety verdict before speaking) — not what was asked | —                             |

## Decision

1. **Cloud Text-to-Speech with Chirp 3: HD voices through the EU endpoint**
   (`apps/api/src/speech/google.ts`). It is the most natural option Google offers with EU
   processing, it has the voices in all app languages and the school languages, and a sentence
   comes back fast enough to start reading while the rest is fetched. Gemini TTS can replace it
   behind the same seam once an EU location is confirmed.
2. **A seam like the model's** (`apps/api/src/speech/gateway.ts`): `GoogleSpeech`,
   `DisabledSpeech` (not configured) and `FakeSpeech` (tests and the dev stack, silent WAV).
   Config-driven: `SPEECH_BACKEND=google|disabled` (default `disabled` until verified live),
   `SPEECH_ENDPOINT` accepts only the EU endpoint. Same service account and project as Vertex.
3. **One endpoint, one sentence**: `POST /voice/speech {text, locale, slow?}` →
   `{mime, audio_base64, voice, speed}`. The app splits what it reads into sentences
   (`lib/speech/sentences.ts`), turns math into words first (`lib/speech/spoken.ts`) and sends
   each sentence; the next one is fetched while the current one plays.
4. **Only the text leaves.** No name, id, age or other data goes to Google — the sentence
   itself can of course contain what Buddy said (e.g. her first name in "Super, Lena!").
5. **Cache**: per learner, keyed by a SHA-256 of (provider voice, locale, rate, text) in
   `speech_cache` (migration `0040`); the text itself is not stored. Kept 24 hours, deleted by the
   scheduler; goes with the learner on deletion. The same question or reply read again costs
   nothing.
6. **Cost protection only**: 1 000 newly synthesised sentences per account and hour
   (`lib/limits.ts` `speech`) — far above a full hour of conversation. Cached sentences are
   always served. Beyond the budget, on any provider error, offline, for a language the provider
   lacks, or when not configured, the app reads that sentence with the phone's voice
   (`expo-speech`), as before. Never silence, never a message about limits.
7. **Voice and speed live on the server** (`buddy_settings.voice`, `voice_speed`): a curated set
   of four voices (`warm` Sulafat, `friendly` Achird, `bright` Zephyr, `clear` Iapetus — two
   female, two male, all calm) and five speed steps (rate 0.75 · 0.88 · 1 · 1.12 · 1.25;
   "langsam" for vocabulary is 0.8 of that).
8. **`set_voice` is a Buddy tool** ("sprich langsamer", "schneller", "wieder normal", "andere
   Stimme"). The model only says _which way_ (`slower`/`faster`/`normal`, `other` or a named
   voice) with her quote; code takes the step, enforces the limits (a request past the slowest
   speed or one that changes nothing goes back to the model, which says so), applies it behind
   the context fence (rule 4) and records an undo (`restore_voice`, only while nothing changed
   the settings since). There is no settings screen for it. _(Amended 2026-09-28: she can also
   pick the voice with a tap — see §Amendment.)_
9. **Read along (gap 12)**: Chirp 3 HD gives no word timings, so the highlight is per sentence —
   the sentence being played, which is a real playback position, not an estimate. The app
   exposes `useBuddyVoice()` (`idle | loading | speaking`, the sentences, the current one and
   progress within it) for talk mode and any text that reads along.

## Consequences

- A new processor entry (`docs/privacy.md`): the text read aloud goes to Google Cloud TTS in
  the EU.
- A cost per sentence (about 0.2–0.3 ct per typical reply); the cache and the budget bound it.
- The phone voice stays as the fallback, so every read-aloud path keeps working without the
  provider (and in the web walkthrough, which runs with `SPEECH_BACKEND` off).
- Word-level highlighting would need a provider with timings (Neural2 with SSML marks, less
  natural) — not chosen.

## Live verification

Done 2026-09-28 with the production service account (`GoogleSpeech.synthesize`, EU endpoint):
`de-DE` in `warm`, `friendly`, `bright` and `clear` returned MP3 audio in 1.5–2.2 s per sentence,
so the API is enabled and the role suffices (step 1) and step 2 holds for German. Production runs
with `SPEECH_BACKEND=google`. Steps 2 (other languages), 3, 4 and 5 are still open.

Before switching `SPEECH_BACKEND=google` on:

1. Enable the **Cloud Text-to-Speech API** in the project; give the service account a role that
   may use it (e.g. `roles/serviceusage.serviceUsageConsumer` — the call is billed to the
   project via `x-goog-user-project`).
2. Check that `https://eu-texttospeech.googleapis.com/v1/text:synthesize` answers for
   `de-DE-Chirp3-HD-Sulafat` (and the other three voices in de, en-GB, fr, es, it) and that
   Google's documentation lists the `eu` endpoint for Chirp 3 HD as processing in the EU.
3. Check that `speakingRate` is honoured by Chirp 3 HD (0.75 and 1.25 audibly differ).
4. On a real iPhone and Android phone: playback through the speaker (also right after the mic
   was used in conversation mode), stop/interrupt, and the fallback in flight mode.
5. Listen: numbers, fractions and units as the app sends them in words.

## Amendment 2026-09-28 — pick the voice with a tap (setup and settings)

- Status: accepted (owner request, 2026-09-28: "hauptsache man kann verschiedene Stimmen
  wählen, ggfs. auch direkt im Setup").
- Asking alone hid the choice: she does not know there are voices to choose from until she
  hears them. So the curated set is now also **visible**, in one component
  (`apps/mobile/components/voice/VoicePicker.tsx`) used in two places:
  1. **Setup**: the last step once the profile exists (for a child after the hand-over, so she
     picks it herself) — "Wie soll Buddy klingen?", the four voices as choices, `warm` already
     chosen, so "Weiter" always works. It needs the profile because the sample is read and the
     choice saved for her; if the app is closed before it, the default simply stays.
  2. **Settings**: a group "Buddys Stimme", closed with the voice she has as its one line (rule 16,
     progressive disclosure); opened, the same picker. The speed stays something she asks Buddy
     for — no second control.
- **Tap = hear and choose.** A tap reads a short sample in that voice: `POST /voice/speech` with
  the optional `voice` (validated against the curated names; her settings stay untouched, the
  audio is cached like any sentence, the same budget applies). The choice itself is
  `PATCH /buddy/settings {voice, version}`: version-checked (a stale tap is refused), applied in
  one transaction that also bumps `context_version` — Buddy's context names her voice, so a
  decision made before the tap (e.g. a `set_voice` "other") is stale and made again (rule 4). An
  older `set_voice` undo no longer applies over it (its expected version moved on). No parents'
  PIN: the voice does not loosen contact.
- **Honest preview**: when Buddy's own voice is not available (not configured, offline, a
  language it lacks, the budget), the phone's voice reads the sample; all four would then sound
  alike, and the picker says so ("Gerade liest die Stimme deines Handys vor …") instead of
  pretending a difference. The choice is stored all the same.
- The set stays **four voices** (`warm`, `friendly`, `bright`, `clear`): the database constraint
  of migration `0040` allows exactly these, and the owner was fine with four. The app shows only
  friendly localized names ("Warm", "Freundlich", "Hell", "Klar"), never the provider's.
- `set_voice` keeps working unchanged ("andere Stimme", "sprich langsamer").
- Not verified live: how the four previews actually sound (the provider call itself is still
  unverified, §Live verification); the walkthrough runs with the phone voice.
