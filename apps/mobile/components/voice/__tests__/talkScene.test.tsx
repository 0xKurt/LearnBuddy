// The thread's tail on the conversation screen while a scene runs (#599 correction): the start
// card stood again under the stage — the scene's name twice, Buddy's role three times.

import type { ActionView, MessageView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { roleIn, talkTail } from '../talkScene.js';

const SCENE = '11111111-1111-4111-8111-111111111111';
const AT = '2026-10-13T08:00:00.000Z';

function message(n: number, role: MessageView['role'], text: string, actions: ActionView[] = []) {
  return MessageView_({ id: `0000000${n}-0000-4000-8000-000000000000`, role, text, actions });
}
function MessageView_(part: Pick<MessageView, 'id' | 'role' | 'text' | 'actions'>): MessageView {
  return {
    ...part,
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    roleplay_feedback: null,
    created_at: AT,
  };
}
const start = (roleplay_id: string): ActionView => ({
  id: `aaaaaaaa-0000-4000-8000-${roleplay_id.slice(-12)}`,
  status: 'applied',
  undoable: false,
  created_at: AT,
  summary: {
    tool: 'start_roleplay',
    roleplay_id,
    language: 'en',
    scene: 'Im Café in London',
    role: 'Kellner',
    points: ['Begrüßen'],
    status: 'active',
  },
});

const opening = message(1, 'buddy', 'Good morning! What can I get you?', [start(SCENE)]);
const hers = message(2, 'learner', 'Could I have two rolls, please?');

describe('the tail of a running scene', () => {
  it('leaves the scene’s own start card out and keeps the line it came with', () => {
    const tail = talkTail([opening, hers], SCENE);
    expect(tail.map((m) => m.text)).toEqual([opening.text, hers.text]);
    expect(tail.flatMap((m) => m.actions)).toEqual([]);
    // The pill under the orb still knows who Buddy plays: it reads the thread, not the tail.
    expect(roleIn([opening, hers], SCENE)).toBe('Kellner');
  });

  it('drops a message that was nothing but that card', () => {
    const card = message(3, 'buddy', '', [start(SCENE)]);
    expect(talkTail([card, hers], SCENE)).toEqual([hers]);
  });

  it('keeps every other card: without a scene, and the card of another scene', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    expect(talkTail([opening, hers], null)).toEqual([opening, hers]);
    expect(talkTail([opening, hers], other)).toEqual([opening, hers]);
  });

  it('is the newest three messages', () => {
    const many = [1, 2, 3, 4, 5].map((n) => message(n, 'learner', `Satz ${n}`));
    expect(talkTail(many, null).map((m) => m.text)).toEqual(['Satz 3', 'Satz 4', 'Satz 5']);
  });
});
