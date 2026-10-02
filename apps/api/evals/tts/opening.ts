// How long does the FIRST spoken piece take (issue #41)? The pause the learner feels in talk
// mode is the silence between Buddy's words appearing and his first sound — one synthesis of
// the opening. `evals/tts/run.ts` measures a whole turn; this one measures only that first
// piece, against the live provider (Google Chirp 3: HD, EU endpoint).
//
//   A) Synthesis over the length of the text — the curve `shortOpening` trades on, and the
//      length at which it crosses a second.
//   B) The first piece of real long Buddy openings, uncut vs. cut at the first clause
//      boundary that is long enough: what she waits for, and whether that piece plays long
//      enough to cover the synthesis of the rest (the prefetch of lib/speech/pipeline.ts).
//
// Every call of a round is measured before any text is repeated, so a slow minute on the
// network lands on all of them instead of on whichever variant ran during it — the first
// version of this run reported a difference between two IDENTICAL texts.
//
// Needs SPEECH_BACKEND=google and the GOOGLE_* variables (apps/api/.env.local). No database,
// no model.
//   cd apps/api && SPEECH_BACKEND=google npx tsx evals/tts/opening.ts [rounds]
// requires live verification in Claude Code session (live provider)

import { loadConfig } from '../../src/config.js';
import { evalEnv } from '../eval-env.js';
import { rateFor } from '../../src/speech/gateway.js';
import { GoogleSpeech } from '../../src/speech/google.js';

import { mp3Seconds } from './mp3.js';

const dotenv = await import('dotenv');
dotenv.config({ path: '.env.local' });

const config = loadConfig({
  ...evalEnv(),
  SPEECH_BACKEND: 'google',
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const speech = new GoogleSpeech(config);
const RATE = rateFor(0, false);
const rounds = Number(process.argv[2] ?? 5);

type Sample = { ms: number; plays: number };

async function synth(text: string): Promise<Sample> {
  const t0 = performance.now();
  const audio = await speech.synthesize({
    text,
    locale: 'de-DE',
    voice: 'warm',
    rate: RATE,
    timeoutMs: 8000,
  });
  return { ms: performance.now() - t0, plays: mp3Seconds(audio.audio) * 1000 };
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

/** Every text once per round, in order, `rounds` times over. */
async function measure(texts: readonly string[]): Promise<Sample[][]> {
  const out: Sample[][] = texts.map(() => []);
  for (let r = 0; r < rounds; r++)
    for (const [i, text] of texts.entries()) out[i]!.push(await synth(text));
  return out;
}

const report = (ss: Sample[]) => {
  const ms = ss.map((s) => s.ms);
  return `${fmt(Math.min(...ms))}   ${fmt(med(ms))}   ${fmt(Math.max(...ms))}`;
};

// ─────────────── A) how synthesis grows with the text ───────────────
//
// One German sentence, cut at word boundaries to the lengths the opening has to choose
// between (the issue measured 17 / 66 / 173 characters).

const FULL =
  'Ein Nenner sagt dir, in wie viele gleiche Teile ein Ganzes zerlegt wurde, und der Zähler sagt, wie viele davon du nimmst, also zum Beispiel drei von vier gleich großen Stücken einer Pizza, und genau das rechnen wir gleich zusammen aus.';

function upTo(chars: number): string {
  if (FULL.length <= chars) return FULL;
  const cut = FULL.lastIndexOf(' ', chars);
  return FULL.slice(0, cut > 0 ? cut : chars).trim();
}

const lengths = [20, 40, 60, 80, 100, 120, 160, 200].map(upTo);
console.log(`# A) Synthese über die Länge (${rounds} Runden, de-DE, Chirp 3: HD, EU-Endpunkt)\n`);
console.log('zeichen   min   median   max   spielt');
const curve = await measure(lengths);
for (const [i, ss] of curve.entries())
  console.log(
    `${String(lengths[i]!.length).padStart(7)}   ${report(ss)}   ${fmt(med(ss.map((s) => s.plays)))}`,
  );

// ─────────────── B) the opening of real long Buddy sentences ───────────────
//
// The cut rule of apps/mobile/lib/speech/readAloud.ts `shortOpening`, kept here because an
// eval cannot import across packages (same as `sentencesOf` in run.ts). Language-independent:
// only punctuation, never a word.

const OPENING_MAX = 110;
const OPENING_MIN = 40;

function cutOpening(spoken: string): string[] {
  if (spoken.length <= OPENING_MAX) return [spoken];
  for (const m of spoken.slice(0, OPENING_MAX).matchAll(/[,;:—–]\s/g)) {
    const at = (m.index ?? 0) + m[0].length;
    if (at < OPENING_MIN) continue;
    return [spoken.slice(0, at).trim(), spoken.slice(at).trim()];
  }
  return [spoken];
}

const OPENINGS = [
  'Der Urknall ist der Moment, in dem unser ganzes Universum angefangen hat, und das war vor etwa 13,8 Milliarden Jahren.',
  'Schön, dass du fragst, denn Brüche addieren ist gar nicht so schwer, sobald beide Brüche denselben Nenner haben, und den finden wir zusammen.',
  'Also, stell dir vor, du hast eine Pizza und teilst sie mit drei Freundinnen, dann bekommt jede genau ein Viertel davon ab.',
  'Für den Englischtest morgen machen wir es ganz ruhig, wir gehen zuerst die Vokabeln durch, danach übst du zwei Sätze laut.',
];

console.log(`\n# B) Erstes Stück eines langen Eröffnungssatzes (${rounds} Runden)\n`);
console.log('was        zeichen   min   median   max');
const gains: number[] = [];
const covered: boolean[] = [];
for (const sentence of OPENINGS) {
  const [head, tail] = cutOpening(sentence);
  if (tail === undefined) {
    const [only] = await measure([sentence]);
    console.log(
      `ungeteilt  ${String(sentence.length).padStart(7)}   ${report(only!)}   (kein Schnitt)`,
    );
    continue;
  }
  const [whole, first, rest] = await measure([sentence, head!, tail]);
  const gain = med(whole!.map((s) => s.ms)) - med(first!.map((s) => s.ms));
  gains.push(gain);
  const plays = med(first!.map((s) => s.plays));
  const restMs = med(rest!.map((s) => s.ms));
  covered.push(plays > restMs);
  console.log(`ganz       ${String(sentence.length).padStart(7)}   ${report(whole!)}`);
  console.log(
    `1. Stück   ${String(head!.length).padStart(7)}   ${report(first!)}   → ${fmt(gain)} früher`,
  );
  console.log(`2. Stück   ${String(tail.length).padStart(7)}   ${report(rest!)}`);
  console.log(
    `           1. Stück spielt ${fmt(plays)}, 2. Stück braucht ${fmt(restMs)} → ${
      plays > restMs ? 'keine Lücke' : 'LÜCKE'
    }\n`,
  );
}
if (gains.length > 0)
  console.log(
    `median früher: ${fmt(med(gains))} · Lücke gedeckt in ${covered.filter(Boolean).length}/${covered.length}`,
  );

// Does the provider cache? If it did, every repeat above would flatter the numbers.
const probe = OPENINGS[0]!;
console.log(
  `\nprovider cache probe: ${fmt((await synth(probe)).ms)} dann ${fmt((await synth(probe)).ms)}`,
);
