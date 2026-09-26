import { describe, expect, it } from 'vitest';

import { replyProgress } from '../stream.js';

const answer = (actions: unknown[], lookups: unknown[] = []) =>
  JSON.stringify({
    lookups,
    actions,
    reply: 'Klar, los geht es.',
    options: null,
    asks_permission: false,
  });

describe('replyProgress', () => {
  it('lets a reply that changes nothing be spoken while it is written', () => {
    const raw = answer([]);
    const cut = raw.slice(0, raw.indexOf('los'));
    expect(replyProgress(cut)).toEqual({ text: 'Klar, ', speakable: true, done: false });
    expect(replyProgress(raw)).toEqual({ text: 'Klar, los geht es.', speakable: true, done: true });
  });

  it('counts a button to tap as changing nothing', () => {
    const raw = answer([{ tool: 'offer_learning', args: { kind: 'explain', text: 'Brüche' } }]);
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
});
