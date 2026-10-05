import { describe, expect, it } from 'vitest';

import { replyProgress } from '../stream.js';
import { TURN_STEP_SCHEMA } from '../prompts.js';

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
    expect(replyProgress(cut)).toEqual({ text: 'Klar, ', speakable: true, done: false });
    expect(replyProgress(raw)).toEqual({ text: 'Klar, los geht es.', speakable: true, done: true });
  });

  it('counts a button to tap as changing nothing', () => {
    const raw = answer([{ tool: 'offer_learning', args: { kind: 'practice', text: 'Brüche' } }]);
    expect(replyProgress(raw)?.speakable).toBe(true);
  });

  it('holds back a reply whose answer changes something, looks something up, or is unknown', () => {
    expect(replyProgress(answer([{ tool: 'remember', args: {} }]))?.speakable).toBe(false);
    expect(replyProgress(answer([], [{ tool: 'material_text' }]))?.speakable).toBe(false);
    expect(replyProgress(answer([{ tool: 'no_such_tool' }]))?.speakable).toBe(false);
    // An older order (reply first) is never spoken early.
    expect(replyProgress('{"reply": "Hallo", "actions": []}')?.speakable).toBe(false);
  });

  it('says nothing before the reply starts', () => {
    expect(replyProgress('{"lookups": [], "actions": [')).toBeNull();
  });

  it('never shows a reply longer than validation allows (repro-28)', () => {
    const long = JSON.stringify({ actions: [], reply: 'x'.repeat(701), options: null });
    expect(replyProgress(long)?.speakable).toBe(false);
    const fits = JSON.stringify({ actions: [], reply: 'x'.repeat(700), options: null });
    expect(replyProgress(fits)?.speakable).toBe(true);
  });

  it('never shows the model words of a safeguarding answer', () => {
    const raw = JSON.stringify({ concern: true, actions: [], reply: 'Oh nein …', options: null });
    expect(replyProgress(raw)?.speakable).toBe(false);
    const calm = JSON.stringify({ concern: false, actions: [], reply: 'Klar.', options: null });
    expect(replyProgress(calm)?.speakable).toBe(true);
  });

  it('shows streamed LaTeX repaired, like the stored reply (p2-streamed-reply-unrepaired-latex-escapes)', () => {
    // The model wrote "\\times" with one backslash: JSON turned it into TAB + "imes".
    const raw = '{"concern":false,"lookups":[],"actions":[],"reply":"Rechne $7 \\times 4$';
    expect(replyProgress(raw)?.text).toBe('Rechne $7 \\times 4$');
  });
});
