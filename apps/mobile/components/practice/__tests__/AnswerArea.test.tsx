// Die Auswahl bleibt nach dem Antworten stehen (Issue #521).
//
// Der Owner am 09.10. zu „Welcher Bruch ist größer?“ nach der Antwort: „Aber da stehen keine
// Brüche“ — die Optionen standen nur, solange die Frage offen war, danach nur noch ihre Blase
// „2/3“. Diese Schicht hält fest: Nach richtiger und falscher Antwort stehen ALLE Optionen da,
// keine mehr tippbar, ihre mit „Deine Wahl“ (Worte, nie Farbe allein), die richtige mit „Lösung“
// nur, wenn der Server die Lösung geschickt hat — in der Hausaufgabenhilfe und im
// laufenden Test nie. Darunter „Weiter“. Dass das auf 360×740 ohne Scrollen passt, misst der
// Walkthrough (tests/web/core-loop-practice.spec.ts), jsdom legt nichts aus.

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
      sessionId="s1"
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
  screen.getByRole('button', { name: /2 Drittel/ }),
  screen.getByRole('button', { name: /3 Fünftel/ }),
];

describe('die Optionen einer beantworteten Auswahlfrage', () => {
  it('bleiben nach einer richtigen Antwort stehen, ihre als „Deine Wahl“, keine mehr tippbar', () => {
    const { answer, onNext } = show({ turns: [tried(TWO, 'correct')] });
    const [two, three] = tiles();
    for (const tile of [two!, three!]) expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.queryByText('Lösung')).toBeNull();
    fireEvent.click(three!);
    expect(answer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('zeigen nach einer falschen Antwort und der Lösung ihre Wahl und die richtige, in Worten', () => {
    show({ turns: [tried(THREE, 'incorrect')], solution: TWO });
    tiles();
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.getByText('Lösung')).toBeTruthy();
    // Nothing tried before her last answer: no "Schon ausprobiert" beside "Deine Wahl".
    expect(screen.queryByText('Schon ausprobiert')).toBeNull();
  });

  it('verraten in der Hausaufgabenhilfe die richtige nicht (keine Lösung vom Server)', () => {
    show({ turns: [tried(THREE, 'incorrect')], solution: null });
    tiles();
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.queryByText('Lösung')).toBeNull();
  });

  it('sagen im laufenden Test nur, welche ihre war', () => {
    show({ turns: [tried(THREE, 'incorrect')], judged: false });
    tiles();
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.queryByText('Lösung')).toBeNull();
    expect(screen.queryByText(/Richtig|Noch nicht/)).toBeNull();
  });

  it('sind offen tippbar, ohne „Weiter“', () => {
    const { answer } = show({ open: true, turns: [] });
    const [two] = tiles();
    expect(two!.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(two!);
    expect(answer).toHaveBeenCalledWith(ITEM.id, { choice: 0 }, TWO);
    expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull();
    expect(screen.queryByText('Deine Wahl')).toBeNull();
  });
});
