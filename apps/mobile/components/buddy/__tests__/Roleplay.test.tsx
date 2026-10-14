// A roleplay in the thread as the design draws it (#599; components/practice/Modes.jsx:20–31 and
// :52–66): the role card on the thread's one card with its way into the spoken scene, and the
// feedback as ONE result card — ticks for what she managed, one box for next time. No score.

import { fireEvent, screen, within } from '@testing-library/react';
import { router } from 'expo-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { RoleplayCard } from '../RoleplayCard.js';
import { RoleplayResult } from '../RoleplayResult.js';

const CARD = {
  tool: 'start_roleplay' as const,
  roleplay_id: '11111111-1111-4111-8111-111111111111',
  language: 'en' as const,
  scene: 'Im Café in London',
  role: 'Kellner',
  points: ['Begrüßen', 'Etwas bestellen', 'Nach dem Preis fragen'],
};

// The stand-in router records where a tap leads (testing/expo-router.ts).
const pushed = (router as unknown as { pushed: unknown[] }).pushed;
beforeEach(() => {
  pushed.length = 0;
});

describe('the role card', () => {
  it('names the language and what it is, the scene, who Buddy plays and her tasks', () => {
    renderInApp(<RoleplayCard roleplay={{ ...CARD, status: 'active', ended_reason: null }} />);
    expect(screen.getByText('Englisch · Rollenspiel')).toBeTruthy();
    // The label is written as it is, not in capitals.
    expect(screen.queryByText('ROLLENSPIEL · ENGLISCH')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Im Café in London' })).toBeTruthy();
    expect(screen.getByText('Buddy')).toBeTruthy();
    expect(screen.getByText('Kellner')).toBeTruthy();
    expect(screen.getByText('Deine Aufgaben')).toBeTruthy();
    for (const task of CARD.points) expect(screen.getByText(task)).toBeTruthy();
  });

  it('starts the scene as a conversation — and has no "end" of its own', () => {
    renderInApp(<RoleplayCard roleplay={{ ...CARD, status: 'active', ended_reason: null }} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Gespräch starten' }));
    expect(pushed).toEqual(['/talk']);
  });

  it('is a quiet line once the scene is over: nothing to start', () => {
    renderInApp(<RoleplayCard roleplay={{ ...CARD, status: 'ended', ended_reason: 'turns' }} />);
    expect(screen.getByText('Vorbei. Die Rückmeldung steht im Gespräch.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Deine Aufgaben')).toBeNull();
  });

  it('points to no feedback where none came: a concern or a scene she left (#599)', () => {
    for (const reason of ['concern', 'lapsed'] as const) {
      const { unmount } = renderInApp(
        <RoleplayCard roleplay={{ ...CARD, status: 'ended', ended_reason: reason }} />,
      );
      expect(screen.getByText('Vorbei.')).toBeTruthy();
      expect(screen.queryByText(/Rückmeldung/)).toBeNull();
      unmount();
    }
  });
});

describe('the feedback is one card', () => {
  const feedback = {
    points: [
      { name: 'Begrüßen', met: true, quote: 'Hello' },
      { name: 'Nach dem Preis fragen', met: false, quote: null },
    ],
    better: [{ said: 'How much it costs?', better: 'How much does it cost?' }],
  };

  it('ticks what she managed, with her own words', () => {
    renderInApp(<RoleplayResult feedback={feedback} />);
    expect(screen.getByText('Rollenspiel')).toBeTruthy();
    expect(screen.getByRole('heading', { name: "So lief's" })).toBeTruthy();
    const good = within(screen.getByTestId('mode-result-good'));
    expect(good.getByText('Begrüßen')).toBeTruthy();
    expect(good.getByText('„Hello“')).toBeTruthy();
    // The tick is not the only signal: a screen reader hears the word for it.
    expect(good.getByLabelText('Geschafft: Begrüßen: „Hello“')).toBeTruthy();
    expect(good.queryByText('Nach dem Preis fragen')).toBeNull();
  });

  it('puts what is still open and the better lines into the one box for next time', () => {
    renderInApp(<RoleplayResult feedback={feedback} />);
    const next = within(screen.getByTestId('mode-result-next'));
    expect(next.getByText('Nächstes Mal')).toBeTruthy();
    expect(next.getByText('Noch nicht dabei')).toBeTruthy();
    expect(next.getByText('Nach dem Preis fragen')).toBeTruthy();
    expect(next.getByText('So klingt es noch besser')).toBeTruthy();
    expect(next.getByText('„How much it costs?“')).toBeTruthy();
    expect(next.getByText('„How much does it cost?“')).toBeTruthy();
  });

  it('has no box when everything was managed, and no button without something to do', () => {
    renderInApp(
      <RoleplayResult
        feedback={{ points: [{ name: 'Begrüßen', met: true, quote: null }], better: [] }}
      />,
    );
    expect(screen.queryByTestId('mode-result-next')).toBeNull();
    expect(screen.getByLabelText('Geschafft: Begrüßen')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
