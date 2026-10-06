// Vorlesen everywhere (issue #434, owner on #386: Vorlesen and Gespräch are "global, in jeder
// Übung"). A Kopfrechnen round and a card pass carry the same Vorlesen switch in their header,
// read the task or the card's front aloud when Vorlesen is on, and read it again on a tap on it —
// no new button; for a screen reader the target is "Nochmal vorlesen". The back of a card
// is never read unasked. Off, nothing is read and the text is no target.
// requires live verification in Claude Code session (the speech output is replaced)

import { act, fireEvent, screen } from '@testing-library/react';
import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';

const spoken = vi.fn();
vi.mock('../../../lib/speech/listen.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  speakInOrder: (parts: Array<{ text: string; lang: string }>) => spoken(parts),
  stop: () => undefined,
}));

const { DrillRound } = await import('../DrillRound.js');
const { CardPass } = await import('../CardPass.js');
const { useVoiceMode } = await import('../../../lib/speech/voiceMode.js');

const item = (
  id: string,
  over: Partial<SessionItemView['item']>,
  answer: string | null = null,
): SessionItemView => ({
  item: {
    id,
    kind: 'numeric',
    prompt: '7 · 8',
    choices: null,
    unit: null,
    topic: null,
    origin: 'buddy',
    lang: null,
    prompt_lang: null,
    subject_kind: null,
    figure: null,
    choice_figures: null,
    image: null,
    tap_choices: null,
    surface: null,
    tap: false,
    task_view: null,
    listen: null,
    passage: null,
    read_aloud: false,
    ...over,
  },
  status: 'open',
  attempts: 0,
  hints_used: 0,
  hints_left: 0,
  hint_available: false,
  hint_offered: false,
  reveal_available: false,
  deferred: false,
  answer,
  listen_transcript: null,
  explanation: null,
  why: null,
});

const A = '11111111-1111-4111-8111-111111111111';

const session = (over: Partial<SessionView>): SessionView => ({
  id: '33333333-3333-4333-8333-333333333333',
  mode: 'practice',
  reveal_allowed: true,
  status: 'active',
  title: 'Runde',
  card_pass: false,
  card_pass_offered: false,
  drill: null,
  preparing: false,
  timer: null,
  items: [],
  turns: [],
  current_item_id: A,
  summary: null,
  ...over,
});

const drill = () =>
  session({
    items: [item(A, {})],
    drill: {
      spec: { range: 'times', rows: [7], carry: null },
      input: 'whole',
      last: null,
      summary: null,
    },
  });

const cards = () =>
  session({
    card_pass: true,
    items: [
      item(A, { kind: 'vocab', prompt: 'le vélo', prompt_lang: 'fr', lang: 'de' }, 'das Fahrrad'),
    ],
  });

const noop = async () => undefined;
const showDrill = () =>
  renderInApp(
    <DrillRound session={drill()} title="Runde" onChange={noop} onClose={() => undefined} />,
  );
const showCards = () =>
  renderInApp(
    <CardPass session={cards()} title="Runde" onChange={noop} onClose={() => undefined} />,
  );

const texts = () => spoken.mock.calls.map((c) => (c[0] as Array<{ text: string }>)[0]!.text);

beforeEach(() => {
  spoken.mockReset();
  useVoiceMode.setState({ readAloud: true, conversation: false });
});
afterEach(() => useVoiceMode.setState({ readAloud: false, conversation: false }));

describe.each([
  ['Kopfrechnen', showDrill, '7 · 8'],
  ['Lernkarten', showCards, 'le vélo'],
] as const)('%s', (_name, show, front) => {
  it('carries the Vorlesen switch in its header', () => {
    show();
    expect(screen.getByRole('switch', { name: /vorlesen/i })).toBeTruthy();
  });

  it('reads the task aloud when it appears, and again on a tap on it', () => {
    show();
    expect(texts()).toHaveLength(1);
    const target = screen.getByRole('button', { name: 'Nochmal vorlesen' });
    act(() => {
      fireEvent.click(target);
    });
    expect(texts()).toHaveLength(2);
    expect(screen.getByText(front)).toBeTruthy();
  });

  it('reads nothing and offers no tap while Vorlesen is off', () => {
    useVoiceMode.setState({ readAloud: false });
    show();
    expect(spoken).not.toHaveBeenCalled();
    expect(screen.queryByTestId('read-again')).toBeNull();
  });
});

it('reads a Kopfrechnen task as math, in words — never the dot as a symbol', () => {
  showDrill();
  expect(texts()[0]).toMatch(/^7 mal 8\.?$/);
});

it('never reads the back of a card unasked', () => {
  showCards();
  expect(texts()).toEqual(['le vélo']);
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Umdrehen' }));
  });
  expect(screen.getByText('das Fahrrad')).toBeTruthy();
  expect(texts()).toEqual(['le vélo']);
});
