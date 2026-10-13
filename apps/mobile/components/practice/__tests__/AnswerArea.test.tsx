// Closed choices remain present and read-only. Ordinary judged choices use the original
// left verdict badge, without repeating a caption; ownership remains checked. A correct
// badge is shown only when the server supplies it. Unjudged tests retain their factual
// own-choice caption without leaking a verdict. Callbacks and answer payloads stay exact.

import type { ItemView, PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { answerForm } from '../../../lib/practice/answerForm.js';
import { renderInApp } from '../../../testing/render.js';
import { AnswerArea } from '../AnswerArea.js';

const TWO = '$\\frac{2}{3}$';
const THREE = '$\\frac{3}{5}$';

const ITEM = {
  id: '00000000-0000-4000-8000-0000000000c1',
  kind: 'multiple_choice',
  prompt: `Welcher Bruch ist größer: ${TWO} oder ${THREE}?`,
  choices: [TWO, THREE],
  choice_figures: null,
  tap_choices: null,
  surface: null,
  tap: null,
  figure: null,
  task_view: null,
} as unknown as ItemView;

let seq = 0;
const tried = (text: string, verdict: 'correct' | 'incorrect') =>
  ({
    id: `t${++seq}`,
    item_id: ITEM.id,
    role: 'learner',
    text,
    verdict,
    reexplain: null,
  }) as unknown as PracticeTurnView;

function show({
  open = false,
  turns,
  solution = null,
  judged = true,
  onNext = vi.fn(),
}: {
  open?: boolean;
  turns: PracticeTurnView[];
  solution?: string | null;
  judged?: boolean;
  onNext?: () => void;
}) {
  const answer = vi.fn();
  renderInApp(
    <AnswerArea
      sessionId={`s${++seq}`}
      item={ITEM}
      open={open}
      form={answerForm(ITEM, open)}
      view={{
        turns,
        tried: new Set(turns.filter((t) => t.verdict === 'incorrect').map((t) => t.text)),
      }}
      canReveal
      drafts={{ text: '', setText: () => undefined }}
      actions={{
        answer,
        spoke: vi.fn(),
        reveal: vi.fn(),
        refetch: vi.fn(),
        stepOpen: null,
      }}
      measured={{ setSurfaceHeight: () => undefined }}
      readAgain={{}}
      onSpeakProgress={() => undefined}
      disabled={false}
      closed={{ solution, judged, onNext }}
    />,
  );
  return { answer, onNext };
}

/** The two option tiles, by what a screen reader hears of the fraction. */
const tiles = () => [
  screen.getByRole('radio', { name: /2 Drittel/ }),
  screen.getByRole('radio', { name: /3 Fünftel/ }),
];

describe('die Optionen einer beantworteten Auswahlfrage', () => {
  it('remain after a correct answer with checked ownership and no clickable choice', () => {
    const { answer, onNext } = show({ turns: [tried(TWO, 'correct')] });
    const [two, three] = tiles();
    for (const tile of [two!, three!]) expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(two!.getAttribute('aria-checked')).toBe('true');
    expect(three!.getAttribute('aria-checked')).toBe('false');
    expect(two!.querySelector('svg')).not.toBeNull();
    expect(three!.querySelector('svg')).toBeNull();
    expect(screen.queryByText('Deine Wahl')).toBeNull();
    expect(screen.queryByText('Lösung')).toBeNull();
    fireEvent.click(three!);
    expect(answer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('show factual ownership and both verdict badges when the server supplies the solution', () => {
    show({ turns: [tried(THREE, 'incorrect')], solution: TWO });
    const [two, three] = tiles();
    expect(two!.getAttribute('aria-checked')).toBe('false');
    expect(three!.getAttribute('aria-checked')).toBe('true');
    expect(two!.querySelector('svg')).not.toBeNull();
    expect(three!.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText('Deine Wahl')).toBeNull();
    expect(screen.queryByText('Lösung')).toBeNull();
    // Only the latest wrong choice: no earlier tried-state caption.
    expect(screen.queryByText('Schon ausprobiert')).toBeNull();
  });

  it('verraten in der Hausaufgabenhilfe die richtige nicht (keine Lösung vom Server)', () => {
    show({ turns: [tried(THREE, 'incorrect')], solution: null });
    const [two, three] = tiles();
    expect(two!.getAttribute('aria-checked')).toBe('false');
    expect(three!.getAttribute('aria-checked')).toBe('true');
    expect(two!.querySelector('svg')).toBeNull();
    expect(three!.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText('Deine Wahl')).toBeNull();
    expect(screen.queryByText('Lösung')).toBeNull();
  });

  it('sagen im laufenden Test nur, welche ihre war', () => {
    show({ turns: [tried(THREE, 'incorrect')], judged: false });
    tiles();
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.queryByText('Lösung')).toBeNull();
    expect(screen.queryByText(/Richtig|Noch nicht/)).toBeNull();
  });

  it('merken die offene Wahl und senden sie erst mit „Prüfen“, ohne „Weiter“', () => {
    const { answer } = show({ open: true, turns: [] });
    const [two] = tiles();
    expect(two!.getAttribute('aria-disabled')).not.toBe('true');
    // Nothing chosen: the slot is the conversation's (the options can be said), not a check.
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
    fireEvent.click(two!);
    expect(two!.getAttribute('aria-checked')).toBe('true');
    expect(answer).not.toHaveBeenCalled();
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check);
    expect(answer).toHaveBeenCalledOnce();
    expect(answer).toHaveBeenCalledWith(ITEM.id, { choice: 0 }, TWO);
    expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull();
    expect(screen.queryByText('Deine Wahl')).toBeNull();
  });

  // One primary slot (#599): "Prüfen" takes it once she has chosen. The way into a conversation
  // stays reachable from there — she takes her choice back with a second tap.
  it('geben den Gesprächsknopf zurück, wenn sie ihre Wahl mit einem zweiten Tipp zurücknimmt', () => {
    const { answer } = show({ open: true, turns: [] });
    const [two] = tiles();
    expect(screen.getByRole('button', { name: 'Mit Buddy sprechen' })).toBeTruthy();
    fireEvent.click(two!);
    expect(screen.queryByRole('button', { name: 'Mit Buddy sprechen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Prüfen' })).toBeTruthy();
    fireEvent.click(two!);
    expect(two!.getAttribute('aria-checked')).not.toBe('true');
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
    const talk = screen.getByRole('button', { name: 'Mit Buddy sprechen' });
    expect(screen.getByTestId('composer-primary').contains(talk)).toBe(true);
    expect(answer).not.toHaveBeenCalled();
  });
});
