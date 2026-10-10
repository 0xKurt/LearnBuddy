// What a read-aloud and a rehearsal talk are measured by (issue #264): words per minute,
// skipped and misread words of the given text, filler sounds, and a talk's parts only with a
// quote that really stands in the transcript. All computed by code from the transcript.

import { describe, expect, it } from 'vitest';

import {
  compareReading,
  countFillers,
  quoteInTranscript,
  talkStructure,
  wordsOf,
  wordsPerMinute,
} from '../talkMeasure.js';

const TEXT =
  'Der kleine Fuchs lief am Morgen durch den Wald. Er suchte etwas zu essen für seine Familie.';

describe('reading a given text aloud', () => {
  it('counts every word as correct when she reads the text as written', () => {
    const r = compareReading(
      TEXT,
      'der kleine fuchs lief am morgen durch den wald er suchte etwas zu essen für seine familie',
    );
    expect(r).toEqual({ correct: 17, skipped: [], misread: [] });
  });

  it('names the words of the text she skipped and the ones she read as something else', () => {
    // "kleine" left out, "Wald" read as "Feld", "seine" read as "eine".
    const r = compareReading(
      TEXT,
      'Der Fuchs lief am Morgen durch den Feld. Er suchte etwas zu essen für eine Familie.',
    );
    expect(r.skipped).toEqual(['kleine']);
    expect(r.misread).toEqual(['Wald', 'seine']);
    expect(r.correct).toBe(14);
  });

  it('does not count a word she repeated or corrected herself as an error of the text', () => {
    const r = compareReading('Er suchte etwas zu essen.', 'Er suchte suchte etwas zu essen.');
    expect(r).toEqual({ correct: 5, skipped: [], misread: [] });
  });

  it('lets a number in the text be said in words', () => {
    const r = compareReading(
      'Im Jahr 1990 fiel die Mauer.',
      'Im Jahr neunzehnhundertneunzig fiel die Mauer.',
    );
    expect(r).toEqual({ correct: 6, skipped: [], misread: [] });
  });

  it('reports every word skipped when nothing was read', () => {
    expect(compareReading('Ein Satz.', '').skipped).toEqual(['Ein', 'Satz']);
  });

  it('computes words per minute from the recorder clock', () => {
    // 17 correct words in 30 s → 34 per minute.
    expect(wordsPerMinute(17, 30_000)).toBe(34);
    expect(wordsPerMinute(90, 60_000)).toBe(90);
    expect(wordsPerMinute(0, 60_000)).toBe(0);
  });
});

describe('a rehearsal talk', () => {
  it('counts the filler sounds the transcript marks and leaves them out of the words', () => {
    const t = 'Heute {äh} erzähle ich euch {ähm} etwas über Vulkane. {äh} Also.';
    expect(countFillers(t)).toBe(3);
    expect(wordsOf(t)).toEqual([
      'Heute',
      'erzähle',
      'ich',
      'euch',
      'etwas',
      'über',
      'Vulkane',
      'Also',
    ]);
  });

  it('finds a quote only where it really stands, case and punctuation aside', () => {
    const t = 'Heute erzähle ich euch etwas über Vulkane. Zum Schluss: danke fürs Zuhören!';
    expect(quoteInTranscript('heute erzähle ich euch etwas über vulkane', t)).toBe(true);
    expect(quoteInTranscript('Danke fürs Zuhören', t)).toBe(true);
    expect(quoteInTranscript('Ich komme jetzt zum Schluss', t)).toBe(false);
    // Part of a word is not a quote.
    expect(quoteInTranscript('kan', 'Vulkane')).toBe(false);
  });

  it('marks a part heard only with a quote from the transcript, never missing by default', () => {
    const t =
      'Heute erzähle ich euch etwas über Vulkane. Ein Vulkan ist ein Berg. Danke fürs Zuhören.';
    expect(
      talkStructure(
        [
          { part: 'opening', present: true, quote: 'Heute erzähle ich euch etwas über Vulkane' },
          // A quote she never said: nothing confirmed, nothing denied.
          { part: 'main', present: true, quote: 'Vulkane brechen alle hundert Jahre aus' },
          { part: 'closing', present: false, quote: null },
        ],
        t,
      ),
    ).toEqual([
      { part: 'opening', status: 'heard' },
      { part: 'main', status: 'unknown' },
      { part: 'closing', status: 'not_heard' },
    ]);
    expect(talkStructure([], t).map((p) => p.status)).toEqual(['unknown', 'unknown', 'unknown']);
  });
});
