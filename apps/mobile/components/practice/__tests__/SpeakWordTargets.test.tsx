import type {
  ItemView,
  PracticeTurnView,
  PronunciationFeedback,
} from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { RADIUS } from '../../../lib/theme/radius.js';
import { TOUCH } from '../../../lib/theme/space.js';
import { SpeakCard } from '../SpeakPanel.js';

vi.mock('../WordSheet.js', () => ({
  WordSheet: ({ word }: { word: PronunciationFeedback['words'][number] | null }) =>
    word ? <div data-testid="chosen-word">{JSON.stringify(word)}</div> : null,
}));
const rgb = (hex: string): string =>
  `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
const feedback: PronunciationFeedback = {
  heard: 'I Pneumonoultramicroscopicsilicovolcanoconiosis I',
  overall: 'almost',
  words: [
    { text: 'I', ok: true, tip: null },
    { text: 'Pneumonoultramicroscopicsilicovolcanoconiosis', ok: false, tip: 'Langsam sprechen.' },
    { text: 'I', ok: false, tip: 'Dehne den Laut.' },
  ],
};
const item = { id: 'spoken-target', prompt: feedback.heard, lang: 'en', topic: null } as ItemView;
const turns = [{ pronunciation: feedback }] as PracticeTurnView[];
describe('pronunciation word action targets', () => {
  it('declares full targets and a wrapping row without changing the selected word object', () => {
    renderInApp(<SpeakCard item={item} turns={turns} sessionId="spoken-session" />);
    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(feedback.words.length);
    expect(styleOf(screen.getByTestId('spoken-word-actions')).flexWrap).toBe('wrap');
    for (const [index, action] of actions.entries()) {
      expect(styleOf(action).minWidth).toBe(`${TOUCH}px`);
      expect(styleOf(action).minHeight).toBe(`${TOUCH}px`);
      expect(styleOf(action).maxWidth).toBe('100%');
      expect(action.getAttribute('aria-label')).toContain(feedback.words[index]!.text);
      fireEvent.click(action);
      expect(JSON.parse(screen.getByTestId('chosen-word').textContent!)).toEqual(
        feedback.words[index],
      );
    }
  });
  it('keeps read-only feedback a spoken summary without inactive word buttons', () => {
    renderInApp(<SpeakCard item={item} turns={turns} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('spoken-word-actions')).toBeNull();
    expect(screen.queryByTestId('chosen-word')).toBeNull();
    expect(screen.getByText(feedback.words[1]!.text)).toBeDefined();
  });

  // Design ui_kits/app/Flows.jsx:108–115 (#599).
  it('underlines only the words to practise, in the "wrong" text colour; the rest stays plain', () => {
    renderInApp(<SpeakCard item={item} turns={turns} />);
    const p = paletteOf('pastell');
    const weak = screen.getByText(feedback.words[1]!.text);
    expect(weak.getAttribute('style')).toContain('underline');
    expect(weak.style.color).toBe(rgb(p.danger));
    // The same weight as the sentence: the underline is the mark, not a bolder word.
    expect(weak.style.fontWeight).toBe('');
    const fine = screen.getAllByText('I')[0]!;
    expect(fine.getAttribute('style') ?? '').not.toContain('underline');
    expect(fine.style.color).toBe('');
  });

  it('puts what the underline means under the card, not into it', () => {
    renderInApp(<SpeakCard item={item} turns={turns} />);
    const legend = screen.getByTestId('speak-legend');
    expect(legend.textContent).toBe('Unterstrichen = nochmal üben');
    let card: HTMLElement | null = screen.getByText(feedback.words[1]!.text);
    while (card && styleOf(card).borderTopLeftRadius !== `${RADIUS.lg}px`)
      card = card.parentElement;
    expect(card, 'the question card').not.toBeNull();
    expect(card!.contains(legend)).toBe(false);
  });

  it('says what to do in one meta line, with the topic where the question names it', () => {
    const view = renderInApp(<SpeakCard item={{ ...item, topic: 'Sprechen' }} turns={[]} />);
    expect(screen.getByText('Sprechen · sag es laut')).toBeDefined();
    view.rerender(<SpeakCard item={item} turns={[]} />);
    expect(screen.getByText('Sag es laut')).toBeDefined();
    expect(screen.queryByTestId('speak-legend')).toBeNull();
  });
});
