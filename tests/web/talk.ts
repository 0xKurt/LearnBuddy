// Shared by the conversation-mode walkthroughs (talk-*.spec.ts, issues #35/#41): a learner,
// Buddy's voice as audible-length silence, and a microphone that "speaks".
//
// requires live verification in Claude Code session — Buddy's natural voice is replaced at the
// network edge (POST /v1/voice/speech answers with a silent WAV, exactly what the API's own
// FakeSpeech returns), because the dev stack runs without Google TTS. Everything else is the
// real app against the real API and the scripted model.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, type Page } from '@playwright/test';

/** A 16-bit mono PCM WAV of `samples` (−1…1). */
function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    b.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return b;
}

/** Silence of `ms`: Buddy "speaking" for that long. */
export function silence(ms: number): Buffer {
  const rate = 8000;
  return wav(new Float32Array(Math.round((rate * ms) / 1000)), rate);
}

/**
 * A microphone file for Chromium (`--use-file-for-fake-audio-capture`): `quietMs` of nothing,
 * then `voiceMs` of something shaped like a voice — a 150 Hz voice with its harmonics, in
 * syllables four times a second. Not a word in it: only its level matters to barge-in, and the
 * scripted model "hears" whatever the walkthrough says it heard.
 */
export function voiceFile(path: string, quietMs: number, voiceMs: number): string {
  const rate = 48_000;
  const total = Math.round((rate * (quietMs + voiceMs)) / 1000);
  const start = Math.round((rate * quietMs) / 1000);
  const out = new Float32Array(total);
  for (let i = start; i < total; i++) {
    const t = (i - start) / rate;
    let v = 0;
    for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * 150 * h * t) / h;
    const syllable = 0.5 * (1 - Math.cos(2 * Math.PI * 4 * t));
    out[i] = 0.18 * v * Math.sqrt(syllable);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wav(out, rate));
  return path;
}

export const FIXTURES = join(__dirname, '../../test-results/web/fixtures');

/**
 * Buddy's natural voice: every sentence answers with `ms` of silence, as a WAV — long enough to
 * talk over, and it really plays (the audio element's clock runs), so read-along, `first_audio`
 * and the reading's end all happen as on a phone.
 */
export async function voiceAsSilence(page: Page, ms: number): Promise<void> {
  const audio = silence(ms).toString('base64');
  await page.route('**/v1/voice/speech', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mime: 'audio/wav', audio_base64: audio, voice: 'warm', speed: 0 }),
    }),
  );
}

export async function onboardTalker(page: Page, tag: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`${tag}-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** Opens conversation mode, lets her "speak" for a moment and sends it (the browser has no pause detection). */
export async function sayOneThing(page: Page, firstTime: boolean): Promise<void> {
  if (firstTime) {
    await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
    await expect(page.getByText('GESPRÄCH')).toBeVisible();
  }
  await expect(page.getByText('Ich höre zu.')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
}

/** Buddy's answer to "Was steht diese Woche an?" (apps/api/src/testing/scenarios/learning-modes.ts). */
export const REPLY = 'Diese Woche steht noch nichts an – magst du etwas üben?';
