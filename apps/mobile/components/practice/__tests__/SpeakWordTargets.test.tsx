import type {
  ItemView,
  PracticeTurnView,
  PronunciationFeedback,
} from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { TOUCH } from '../../../lib/theme/space.js';
import { SpeakCard } from '../SpeakPanel.js';

vi.mock('../WordSheet.js', () => ({
  WordSheet: ({ word }: { word: PronunciationFeedback['words'][number] | null }) =>
    word ? <div data-testid="chosen-word">{JSON.stringify(word)}</div> : null,
}));
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
});
