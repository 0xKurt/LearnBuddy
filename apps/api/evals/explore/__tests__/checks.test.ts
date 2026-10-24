import { describe, expect, it } from 'vitest';
import { textViolations, visiblePairs } from '../checks.js';
import { Budget } from '../budget.js';

describe('child explorer hard predicates', () => {
  it.each(['```text\nhead\n```', '~~~\nhead\n~~~'])(
    'detects fences before publication: %s',
    (text) => {
      expect(textViolations(text)).toContain('text.code-fence');
    },
  );
  it.each(['┌──┐\n│x │\n└──┘', '+-----+\n| arm |\n+-----+'])('detects drawings: %s', (text) => {
    expect(textViolations(text)).toContain('text.drawing');
  });
  it.each([
    '3 - 2 = 1',
    'x | y means or',
    '| Deutsch | English |\n| --- | --- |\n| Hund | dog |',
    'Die Achse hat die Punkte (0, 1) und (2, 3).',
    'Benutze `x` als Variable.',
  ])('allows ordinary learning text: %s', (text) => {
    expect(textViolations(text)).toEqual([]);
  });
  it('detects a tool not in a hand-maintained shortlist from the supplied schema', () => {
    expect(textViolations('Ich nutze schedule_check jetzt.', '', ['schedule_check'])).toContain(
      'text.internal',
    );
  });
  it('detects literal six-word system fragments but not substrings inside words', () => {
    expect(
      textViolations('one two three four five six', 'one two three four five six seven'),
    ).toContain('text.prompt-leak');
    expect(
      textViolations('one two three four five six', 'someone two three four five sixty'),
    ).toEqual([]);
  });
  it('never refunds a request without a usage receipt', () => {
    const b = new Budget(1);
    b.reserve(0.7)('buddy', null);
    expect(b.spent).toBe(0.7);
    expect(() => b.reserve(0.31)).toThrow('cost limit');
  });
  it('counts simultaneous reservations and refuses a second settlement', () => {
    const b = new Budget(1);
    const settle = b.reserve(0.8);
    expect(() => b.reserve(0.3)).toThrow('cost limit');
    settle('test', null);
    expect(() => settle('test', null)).toThrow('already settled');
  });
});

it('rejects non-finite reservations and stops further calls on interruption', () => {
  const b = new Budget(1);
  expect(() => b.reserve(Number.NaN)).toThrow('Invalid');
  expect(() => b.reserve(-1)).toThrow('Invalid');
  b.stop('operator interrupted');
  expect(() => b.check()).toThrow('interrupted');
});

it('counts vocabulary rows without counting a Markdown table header', () => {
  expect(
    visiblePairs('| Deutsch | English |\n| --- | --- |\n| Hund | dog |\n| Katze | cat |'),
  ).toBe(2);
  expect(visiblePairs('1. Hund – dog\n2. Katze – cat')).toBe(2);
});

it('detects snake-case schema fields and permits ordinary tool-name words', () => {
  expect(textViolations('Das Feld avoid_weekdays ist leer.')).toContain('text.internal');
  expect(textViolations('I will remember what you said.')).toEqual([]);
});

it('accepts an explicit preparation refusal but rejects a malformed offer request', async () => {
  const { honestRefusal } = await import('../checks.js');
  expect(
    honestRefusal({ error: { code: 'invalid_input', details: { reason: 'not_usable' } } }),
  ).toBe(true);
  expect(honestRefusal({ error: { code: 'invalid_input', details: { issues: [] } } })).toBe(false);
  expect(honestRefusal({ error: { code: 'internal_error' } })).toBe(false);
});

it('accepts a genuinely shorter prose summary without demanding list formatting', async () => {
  const { goalProblems } = await import('../checks.js');
  const { MessageView } = await import('@learnbuddy/shared-types/contracts');
  const message = (text: string) =>
    MessageView.parse({
      id: crypto.randomUUID(),
      role: 'buddy',
      text,
      status: 'done',
      failure_code: null,
      client_message_id: null,
      options: null,
      reply_to_id: null,
      outreach: null,
      actions: [],
      roleplay_feedback: null,
      announces: null,
      created_at: '2026-10-24T10:00:00Z',
    });
  const goal = {
    id: 'summary-counterexample',
    issue: 944,
    wants: 'Short summary',
    messages: ['Explain', 'Summarise'],
    expect: 'summary' as const,
  };
  const detailed =
    'Bones support the body, protect organs and help movement. The skull protects the brain. Ribs protect the lungs. Joints connect bones. Bone marrow makes blood cells.';
  expect(
    goalProblems(
      goal,
      [
        message(detailed),
        message('Bones support and protect us, enable movement and make blood cells.'),
      ],
      [],
      [],
    ),
  ).toEqual([]);
  expect(goalProblems(goal, [message(detailed), message(detailed)], [], [])[0]?.invariant).toBe(
    'summary.condensation',
  );
});

it('does not satisfy a photo goal by reopening an older unrelated exercise', async () => {
  const { photoSourceMatches } = await import('../checks.js');
  expect(photoSourceMatches(['photographed-item'], ['older-item'])).toBe(false);
  expect(photoSourceMatches(['photographed-item'], ['photographed-item'])).toBe(true);
  expect(photoSourceMatches([], [])).toBe(false);
});

it('detects a bare stick figure without treating ordinary division as a drawing', () => {
  expect(textViolations('O\n/|\\\n/ \\')).toContain('text.drawing');
  expect(textViolations('O ist eine Variable. Der Term x / y ist ein Quotient.')).toEqual([]);
});
