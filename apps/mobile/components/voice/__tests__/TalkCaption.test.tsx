// Under the orb on the conversation screen: one small status and ONE centred line
// (design ui_kits/app/Talk.jsx:27–30, #599).

import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { voiceStore } from '../../../lib/speech/voiceState.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp } from '../../../testing/render.js';
import { TalkCaption } from '../TalkCaption.js';

const REPLY = 'Okay! Wie sicher fühlst du dich schon beim Kürzen?';
/** A reply that was written in front of her. */
const HIS = { who: 'buddy' as const, id: 't1', text: REPLY, whole: false };

/** What the component itself declares on this element (react-native-web sets it inline). */
const own = (el: Element) => (el as HTMLElement).style;

/** A colour as the browser reports it. */
function css(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

afterEach(() => act(() => voiceStore.reset()));

describe('the status', () => {
  it('is one small line, the heading a screen reader hears change', () => {
    renderInApp(<TalkCaption status="Ich denke nach …" line={null} />);
    const status = screen.getByRole('heading', { name: 'Ich denke nach …' });
    expect(own(status).fontSize).toBe('13px');
    expect(own(status).lineHeight).toBe('18px');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.queryByTestId('talk-line')).toBeNull();
  });
});

describe('the one line', () => {
  it('shows her own words quietly, 22/29 and centred', () => {
    renderInApp(
      <TalkCaption status="Ich höre zu." line={{ who: 'her', text: 'Ich schreibe Freitag' }} />,
    );
    const words = screen.getByText('Ich schreibe Freitag');
    expect(own(words).fontSize).toBe('22px');
    expect(own(words).lineHeight).toBe('29px');
    expect(own(words).textAlign).toBe('center');
    expect(own(words).color).toBe(css(paletteOf('pastell').ink2));
    expect(screen.getByLabelText('Du: Ich schreibe Freitag')).toBeTruthy();
  });

  it('shows the sentence Buddy’s voice is on, in full ink — never two lines of reply at once', () => {
    renderInApp(<TalkCaption status="Buddy spricht …" line={{ ...HIS, speaking: true }} />);
    // Before a sentence is known the reply stands as it is.
    expect(screen.getByText(REPLY)).toBeTruthy();
    act(() =>
      voiceStore.set({
        phase: 'speaking',
        text: REPLY,
        sentences: ['Okay!', 'Wie sicher fühlst du dich schon beim Kürzen?'],
        index: 1,
      }),
    );
    const sentence = screen.getByText('Wie sicher fühlst du dich schon beim Kürzen?');
    expect(own(sentence).color).toBe(css(paletteOf('pastell').ink));
    expect(screen.queryByText('Okay!')).toBeNull();
    expect(screen.getAllByTestId('talk-line')).toHaveLength(1);
  });

  it('keeps his whole answer readable, quietly, once he is silent', () => {
    renderInApp(
      <TalkCaption status="Bereit, wenn du es bist." line={{ ...HIS, speaking: false }} />,
    );
    // Whatever the voice store still holds: nothing of it is marked as being said.
    act(() => voiceStore.set({ phase: 'speaking', text: REPLY, sentences: ['Okay!'], index: 0 }));
    const answer = screen.getByText(REPLY);
    expect(own(answer).color).toBe(css(paletteOf('pastell').ink2));
    // Longer than its room, it scrolls inside it instead of being cut.
    expect(own(screen.getByTestId('scroll-talk')).maxHeight).toBe('174px');
  });

  it('shows an answer that arrived whole in full while it is read (the help answer, rule 18)', () => {
    const HELP = 'Das klingt schwer. Ruf die Nummer gegen Kummer an: 116 111.';
    renderInApp(
      <TalkCaption
        status="Buddy spricht …"
        line={{ who: 'buddy', id: 't2', text: HELP, whole: true, speaking: true }}
      />,
    );
    // His voice is on the first sentence: the number in the second one is on screen all the same.
    act(() =>
      voiceStore.set({
        phase: 'speaking',
        text: HELP,
        sentences: ['Das klingt schwer.', 'Ruf die Nummer gegen Kummer an: 116 111.'],
        index: 0,
      }),
    );
    const answer = screen.getByText(HELP);
    expect(own(answer).color).toBe(css(paletteOf('pastell').ink));
    expect(screen.queryByText('Das klingt schwer.')).toBeNull();
  });

  it('gives the words the room it is handed, not a count of lines (talkRoom.ts)', () => {
    renderInApp(
      <TalkCaption
        status="Buddy spricht …"
        line={{ who: 'buddy', id: 't2', text: 'Ruf an: 116 111.', whole: true, speaking: true }}
        lineRoom={400}
      />,
    );
    expect(own(screen.getByTestId('scroll-talk')).maxHeight).toBe('400px');
  });

  it('keeps that answer in full ink once he is silent', () => {
    const HELP = 'Ruf an: 116 111.';
    renderInApp(
      <TalkCaption
        status="Tipp aufs Mikro, wenn du fertig bist."
        line={{ who: 'buddy', id: 't2', text: HELP, whole: true, speaking: false }}
      />,
    );
    expect(own(screen.getByText(HELP)).color).toBe(css(paletteOf('pastell').ink));
  });
});
