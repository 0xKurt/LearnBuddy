// requires live verification in Claude Code session — the voice is replaced here (CLAUDE.md
// rule 8: the outside world may be, the database never).
//
// "Vorlesen" at every question (issue #238): one tap reads the question, a second tap stops it,
// the next question or leaving the screen stops it too, and a screen reader hears what the
// button does in words — not only an icon. What it reads is the spoken text it is handed
// (math in words); the button itself never turns LaTeX into sound.

import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { ReadQuestionButton } from '../ReadQuestionButton.js';

type End = 'done' | 'stopped' | 'error';
const voice = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  onEnd: null as ((why: End) => void) | null,
}));

vi.mock('../../../lib/speech/listen.js', () => ({
  speak: (text: string, lang: string, opts: { onEnd?: (why: End) => void }) => {
    voice.speak(text, lang);
    voice.onEnd = opts.onEnd ?? null;
    return Promise.resolve();
  },
  stop: () => {
    voice.stop();
    voice.onEnd?.('stopped');
  },
}));

const SPOKEN = 'Lena hat 12 Äpfel und isst ein Viertel davon. Wie viele bleiben übrig?';

beforeEach(() => {
  voice.speak.mockClear();
  voice.stop.mockClear();
  voice.onEnd = null;
});

describe('ReadQuestionButton', () => {
  it('names itself for a screen reader and reads the spoken text in its language', () => {
    renderInApp(<ReadQuestionButton text={SPOKEN} lang="de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Frage vorlesen' }));
    expect(voice.speak).toHaveBeenCalledWith(SPOKEN, 'de');
  });

  it('stops on a second tap and says so in words while it plays', () => {
    renderInApp(<ReadQuestionButton text={SPOKEN} lang="de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Frage vorlesen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anhalten' }));
    expect(voice.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Frage vorlesen' })).toBeTruthy();
  });

  it('stops when it goes away mid-sentence (next question, leaving the screen)', () => {
    const view = renderInApp(<ReadQuestionButton text={SPOKEN} lang="de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Frage vorlesen' }));
    view.unmount();
    expect(voice.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop anything when it goes away silent', () => {
    const view = renderInApp(<ReadQuestionButton text={SPOKEN} lang="de" />);
    view.unmount();
    expect(voice.stop).not.toHaveBeenCalled();
  });

  it('is back to "Frage vorlesen" once the reading is over', () => {
    renderInApp(<ReadQuestionButton text={SPOKEN} lang="de" />);
    fireEvent.click(screen.getByRole('button', { name: 'Frage vorlesen' }));
    act(() => voice.onEnd?.('done'));
    expect(screen.getByRole('button', { name: 'Frage vorlesen' })).toBeTruthy();
  });
});
