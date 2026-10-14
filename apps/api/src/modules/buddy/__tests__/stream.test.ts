import { describe, expect, it } from 'vitest';

import { aliasSet, replyProgress } from '../stream.js';
import { registerLearning } from '../../learning/register.js';
import { buddyPrompt } from '../prompts.js';

// The prompt is built from what the learning domain registers (issue #107).
registerLearning();
const TURN_STEP_SCHEMA = buddyPrompt().turnStepSchema;
/** A STATE without aliases. */
const NONE: ReadonlySet<string> = new Set();

/**
 * The order the model really writes its fields in, taken from the schema itself.
 *
 * `replyProgress` closes the half-written JSON at `"reply":` and reads what came BEFORE
 * it, so `lookups` and `actions` have to be in front of `reply` for it to decide anything.
 * This helper used to hardcode that order — which meant a reorder of the schema (tried on
 * 01.10. to make the prefix cache hit, see docs/decisions/prefix-cache-2026-10-01.md)
 * silently stopped the guard from firing and every test here stayed green. A lookup
 * round's reply is thrown away; shown and read aloud, it is a sentence Buddy takes back
 * two seconds later.
 *
 * Deriving the order here means the next attempt fails loudly instead.
 */
const FIELD_ORDER = Object.keys(
  (TURN_STEP_SCHEMA as { properties?: Record<string, unknown> }).properties ?? {},
);

const answer = (actions: unknown[], lookups: unknown[] = []) => {
  const value: Record<string, unknown> = {
    lookups,
    actions,
    reply: 'Klar, los geht es.',
    options: null,
    asks_permission: false,
  };
  const ordered: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) if (key in value) ordered[key] = value[key];
  for (const key of Object.keys(value)) if (!(key in ordered)) ordered[key] = value[key];
  return JSON.stringify(ordered);
};

describe('the field order the guard depends on', () => {
  it('writes lookups and actions before the reply', () => {
    // If this fails, `replyProgress` can no longer see them and every other test in this
    // file would pass while the guard does nothing.
    expect(FIELD_ORDER.indexOf('lookups')).toBeLessThan(FIELD_ORDER.indexOf('reply'));
    expect(FIELD_ORDER.indexOf('actions')).toBeLessThan(FIELD_ORDER.indexOf('reply'));
  });
});

describe('replyProgress', () => {
  it('lets a reply that changes nothing be spoken while it is written', () => {
    const raw = answer([]);
    const cut = raw.slice(0, raw.indexOf('los'));
    expect(replyProgress(cut, NONE)).toEqual({ text: 'Klar, ', speakable: true, done: false });
    expect(replyProgress(raw, NONE)).toEqual({
      text: 'Klar, los geht es.',
      speakable: true,
      done: true,
    });
  });

  it('counts a button to tap as changing nothing', () => {
    const raw = answer([{ tool: 'offer_learning', args: { kind: 'practice', text: 'Brüche' } }]);
    expect(replyProgress(raw, NONE)?.speakable).toBe(true);
  });

  it('holds back a reply whose answer changes something, looks something up, or is unknown', () => {
    expect(replyProgress(answer([{ tool: 'remember', args: {} }]), NONE)?.speakable).toBe(false);
    expect(replyProgress(answer([], [{ tool: 'material_text' }]), NONE)?.speakable).toBe(false);
    expect(replyProgress(answer([{ tool: 'no_such_tool' }]), NONE)?.speakable).toBe(false);
    // An older order (reply first) is never spoken early.
    expect(replyProgress('{"reply": "Hallo", "actions": []}', NONE)?.speakable).toBe(false);
  });

  it('says nothing before the reply starts', () => {
    expect(replyProgress('{"lookups": [], "actions": [', NONE)).toBeNull();
  });

  it('never shows a reply longer than validation allows (repro-28)', () => {
    const long = JSON.stringify({ actions: [], reply: 'x'.repeat(701), options: null });
    expect(replyProgress(long, NONE)?.speakable).toBe(false);
    const fits = JSON.stringify({ actions: [], reply: 'x'.repeat(700), options: null });
    expect(replyProgress(fits, NONE)?.speakable).toBe(true);
  });

  it('never shows the model words of a safeguarding answer', () => {
    const raw = JSON.stringify({ concern: true, actions: [], reply: 'Oh nein …', options: null });
    expect(replyProgress(raw, NONE)?.speakable).toBe(false);
    const calm = JSON.stringify({ concern: false, actions: [], reply: 'Klar.', options: null });
    expect(replyProgress(calm, NONE)?.speakable).toBe(true);
  });

  it('shows streamed LaTeX repaired, like the stored reply (p2-streamed-reply-unrepaired-latex-escapes)', () => {
    // The model wrote "\\times" with one backslash: JSON turned it into TAB + "imes".
    const raw = '{"concern":false,"lookups":[],"actions":[],"reply":"Rechne $7 \\times 4$';
    expect(replyProgress(raw, NONE)?.text).toBe('Rechne $7 \\times 4$');
  });
});

describe('a button is spoken early only if the answer will pass its checks (#666)', () => {
  const offer = (args: object) => answer([{ tool: 'offer_learning', args }]);

  it('holds back an offer with an argument its schema refuses', () => {
    // The Zweitaudit probe: an invalid kind "touches nothing" and was spoken as "ready", then
    // rejected by TurnDecision — she heard a promise that never got its button.
    expect(replyProgress(offer({ kind: 'quiz', text: 'Brüche' }), NONE)?.speakable).toBe(false);
    expect(replyProgress(offer({ kind: 'practice', text: 'B' }), NONE)?.speakable).toBe(false);
    expect(replyProgress(offer({ kind: 'practice' }), NONE)?.speakable).toBe(false);
  });

  it('holds back an offer that names an alias this STATE does not have', () => {
    const forGoal = offer({ kind: 'test', text: 'Brüche', goal: 'g2' });
    expect(replyProgress(forGoal, new Set(['g1', 'sh1']))?.speakable).toBe(false);
    expect(replyProgress(forGoal, new Set(['g1', 'g2']))?.speakable).toBe(true);
    const rehearsal = answer([
      { tool: 'offer_rehearsal', args: { kind: 'talk', goal: 'g7', text: null } },
    ]);
    expect(replyProgress(rehearsal, NONE)?.speakable).toBe(false);
  });

  it('still speaks a valid offer and a reply without actions at once', () => {
    expect(replyProgress(offer({ kind: 'practice', text: 'Brüche' }), NONE)?.speakable).toBe(true);
    const drill = answer([{ tool: 'offer_drill', args: { range: 'times', rows: [6, 7] } }]);
    expect(replyProgress(drill, NONE)?.speakable).toBe(true);
    expect(replyProgress(answer([]), NONE)?.speakable).toBe(true);
  });

  it('reads the aliases of every kind STATE holds', () => {
    const set = aliasSet({
      goals: new Map([['g1', {}]]),
      steps: new Map([['st2', {}]]),
      materials: new Map([['sh3', {}]]),
      note: 'no map',
    });
    expect([...set].sort()).toEqual(['g1', 'sh3', 'st2']);
  });
});
