import { describe, expect, it } from 'vitest';

import {
  checkFeedback,
  feedbackText,
  languageName,
  ROLEPLAY_FEEDBACK_SYSTEM,
  ROLEPLAY_SYSTEM,
  ROLEPLAY_TURN_SCHEMA,
  roleplayFrame,
  type RoleplayRow,
} from '../roleplay.js';

const POINTS = ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'];
const HERS = ['Hello!', 'I want a tea', 'How much is it?'];

describe('roleplay feedback is checked against her own lines (issue #244)', () => {
  it('counts a key point only with a quote that stands in what she wrote', () => {
    const fb = checkFeedback(
      POINTS,
      {
        points: [
          { point: 'k1', met: true, quote: 'Hello' },
          { point: 'k2', met: true, quote: 'Could I have a tea' },
          { point: 'k3', met: false, quote: 'How much is it?' },
        ],
        better: [],
      },
      HERS,
    );
    expect(fb.points.map((p) => p.met)).toEqual([true, false, false]);
    expect(fb.points[1]!.quote).toBeNull();
  });

  it('a point the model left out is not managed, and a word fragment is no quote', () => {
    const fb = checkFeedback(
      POINTS,
      { points: [{ point: 'k3', met: true, quote: 'muc' }], better: [] },
      HERS,
    );
    expect(fb.points.map((p) => p.met)).toEqual([false, false, false]);
  });

  it('drops a better line that is not hers, a repeat, and one that changes nothing', () => {
    const fb = checkFeedback(
      POINTS,
      {
        points: [],
        better: [
          { said: 'I want a tea', better: 'Could I have a tea, please?' },
          { said: 'i want a tea', better: 'A tea, please.' },
          { said: 'Give me cake', better: 'May I have some cake?' },
          { said: 'Hello!', better: 'hello!' },
        ],
      },
      HERS,
    );
    expect(fb.better).toEqual([{ said: 'I want a tea', better: 'Could I have a tea, please?' }]);
  });

  it('says each point in words, with her words as the proof — no grade, no count', () => {
    const text = feedbackText('de', {
      points: [
        { name: 'Begrüßen', met: true, quote: 'Hello' },
        { name: 'Etwas bestellen', met: false, quote: null },
      ],
      better: [{ said: 'I want a tea', better: 'Could I have a tea, please?' }],
    });
    expect(text).toContain('✓ Begrüßen: geschafft – „Hello“');
    expect(text).toContain('○ Etwas bestellen: noch nicht dabei');
    expect(text).not.toMatch(/\d/);
  });

  it('names the language in her own app language, from the platform', () => {
    expect(languageName('fr', 'de')).toBe('Französisch');
    expect(languageName('en', 'fr')).toBe('anglais');
  });
});

describe('what an in-role turn is sent', () => {
  const play: RoleplayRow = {
    id: '00000000-0000-0000-0000-000000000001',
    learner_id: '00000000-0000-0000-0000-000000000002',
    language: 'fr',
    scene: 'Im Laden',
    role: 'Verkäuferin',
    points: POINTS,
    start_seq: '1',
    turns: 10,
    max_turns: 12,
    status: 'active',
    last_at: new Date(0),
  };

  it('renders the frame from the row, with the turns left', () => {
    const frame = roleplayFrame(play, { level: 'school', grade: 7, isMinor: true });
    expect(frame).toContain('Language: French (fr)');
    expect(frame).toContain('- k2: Etwas bestellen');
    expect(frame).toContain('Her level: school, grade 7 (minor)');
    expect(frame).toContain('Her turns left after this one: 1');
  });

  it('has no tools, and the static prompts carry no German (one cached block for all, #201)', () => {
    expect(JSON.stringify(ROLEPLAY_TURN_SCHEMA)).not.toContain('actions');
    for (const text of [
      ROLEPLAY_SYSTEM,
      ROLEPLAY_FEEDBACK_SYSTEM,
      JSON.stringify(ROLEPLAY_TURN_SCHEMA),
    ])
      expect(text).not.toMatch(/[äöüßÄÖÜ]/);
  });
});
