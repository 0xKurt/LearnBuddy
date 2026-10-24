import { describe, expect, it } from 'vitest';
import {
  checkedPronunciationPlan,
  gradePronunciation,
  PronunciationEvidence,
} from '../pronunciation.js';

const plan = () =>
  checkedPronunciationPlan('Through the trees.', 'en', [['true', 'threw'], [], ['tries']])!;
const evidence = (heard = ['through', 'the', 'trees'], confidence = 0.95) => ({
  source: 'audio-model' as const,
  heard: heard.join(' '),
  elapsed_ms: 123,
  words: heard.map((word) => ({ heard: word, confidence })),
  unavailable: [],
});

describe('pronunciation: evidence, never transcript equals success', () => {
  it('rejects invented targets, malformed candidates and incomplete preparation', () => {
    expect(checkedPronunciationPlan('Through the trees.', 'en', [['true']])).toBeNull();
    expect(checkedPronunciationPlan('Through.', 'en', [['through']])).toBeNull();
    expect(checkedPronunciationPlan('Through.', 'en', [['two words']])).toBeNull();
    expect(checkedPronunciationPlan('Through.', 'en', [['[unk]']])).toBeNull();
    expect(plan().words[0]).toEqual({ expected: 'Through', confusions: ['true', 'threw'] });
  });
  it('uses central confidence thresholds and never accepts a confident confusion', () => {
    expect(gradePronunciation(plan(), evidence()).words.map((w) => w.verdict)).toEqual([
      'passt',
      'passt',
      'passt',
    ]);
    expect(gradePronunciation(plan(), evidence(['true', 'the', 'trees'])).words[0]?.verdict).toBe(
      'nochmal',
    );
    expect(gradePronunciation(plan(), evidence(undefined, 0.7)).words[0]?.verdict).toBe('fast');
    expect(gradePronunciation(plan(), evidence(undefined, 0.2)).words[0]?.verdict).toBe('unsicher');
  });
  it('does not shift every later word after an omission, insertion or repetition', () => {
    expect(
      gradePronunciation(plan(), evidence(['the', 'trees'])).words.map((w) => w.verdict),
    ).toEqual(['unsicher', 'passt', 'passt']);
    expect(
      gradePronunciation(plan(), evidence(['through', 'a', 'the', 'trees'])).words.map(
        (w) => w.verdict,
      ),
    ).toEqual(['passt', 'passt', 'passt']);
    expect(gradePronunciation(plan(), evidence(['through', 'a', 'the', 'trees'])).overall).toBe(
      'unsicher',
    );
    const repeated = checkedPronunciationPlan('Go go home.', 'en', [[], [], ['hope']])!;
    expect(
      gradePronunciation(repeated, evidence(['go', 'home'])).words.filter(
        (w) => w.verdict === 'passt',
      ),
    ).toHaveLength(2);
  });
  it('keeps unknown sounds and missing vocabulary uncertain, including a missing competitor', () => {
    expect(gradePronunciation(plan(), evidence(['[unk]', 'the', 'trees'])).words[0]?.verdict).toBe(
      'unsicher',
    );
    expect(
      gradePronunciation(plan(), { ...evidence(), unavailable: ['threw'] }).words[0]?.verdict,
    ).toBe('unsicher');
    expect(gradePronunciation(plan(), evidence([])).overall).toBe('unsicher');
  });
  it('defers even maximally confident local corrections and low-confidence matches to audio', () => {
    expect(
      gradePronunciation(plan(), { ...evidence(['true', 'the', 'trees'], 1), source: 'vosk' })
        .overall,
    ).toBe('unsicher');
    expect(gradePronunciation(plan(), { ...evidence(), source: 'vosk' }).overall).toBe('unsicher');
    expect(gradePronunciation(plan(), { ...evidence(undefined, 1), source: 'vosk' }).overall).toBe(
      'passt',
    );
  });
  it('refuses malformed or excessive evidence before scoring', () => {
    expect(PronunciationEvidence.safeParse(evidence(undefined, 1.1)).success).toBe(false);
    expect(
      PronunciationEvidence.safeParse(evidence(Array.from({ length: 81 }, () => 'word'))).success,
    ).toBe(false);
  });
  it('anchors a known competitor even when a replacement inserts and omits neighbouring words', () => {
    const french = checkedPronunciationPlan("J'habite à Berlin.", 'fr', [['mange'], [], []])!;
    const graded = gradePronunciation(french, evidence(['je', 'mange', 'berlin']));
    expect(graded.words.map((w) => [w.heard, w.verdict])).toEqual([
      ['mange', 'nochmal'],
      [null, 'unsicher'],
      ['berlin', 'passt'],
    ]);
  });
});
