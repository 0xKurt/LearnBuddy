// The two layouts of "nothing here" (#599 library): the empty page inside the app, as the design
// draws it (ui_kits/app/Gaps.jsx:44–67), and the centred system state it must not change
// (components/core/States.jsx:45–56 — update, deleting, load failed).
//
// Declared styles only — jsdom lays nothing out; where it sits on a phone is tests/web.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GUTTER_OUTER } from '../../../lib/theme/space.js';
import { EMPTY_STATE } from '../../../lib/theme/states.js';
import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { EmptyState } from '../EmptyState.js';
import { Section } from '../Section.js';

/** What the component itself declares on this element (react-native-web sets it inline). */
const own = (el: Element) => (el as HTMLElement).style;

const action = (
  <Btn icon="camera" onPress={() => undefined}>
    Neues Blatt fotografieren
  </Btn>
);

describe('EmptyState', () => {
  it('as a page: one block at the start edge — bold line, sentence, one action with its sign', () => {
    renderInApp(
      <EmptyState
        page
        title="Hier landen deine Blätter"
        body="Fotografier ein Blatt."
        action={action}
      />,
    );
    const head = screen.getByRole('heading', { name: 'Hier landen deine Blätter' });
    expect(own(head).fontSize).toBe(`${EMPTY_STATE.page.head.fontSize}px`);
    expect(own(head).fontWeight).toBe('800');
    expect(own(head).textAlign).not.toBe('center');
    expect(own(screen.getByText('Fotografier ein Blatt.')).textAlign).not.toBe('center');
    const block = head.parentElement?.parentElement as Element;
    expect(own(block).paddingLeft).toBe(`${GUTTER_OUTER}px`);
    expect(own(block).paddingBottom).toBe(`${EMPTY_STATE.page.bottom}px`);
    const button = screen.getByRole('button', { name: 'Neues Blatt fotografieren' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(own(button.parentElement as Element).alignSelf).toBe('flex-start');
  });

  it('as a system state stays centred at its own size', () => {
    renderInApp(
      <EmptyState title="Bitte einmal aktualisieren" body="Es gibt eine neue Version." />,
    );
    const head = screen.getByRole('heading', { name: 'Bitte einmal aktualisieren' });
    expect(own(head).textAlign).toBe('center');
    expect(own(head).fontSize).toBe(`${EMPTY_STATE.title.fontSize}px`);
    expect(own(screen.getByText('Es gibt eine neue Version.')).textAlign).toBe('center');
  });
});

describe('Section', () => {
  it('carries the same quiet label as a list group: sentence case, no tracking', () => {
    renderInApp(
      <Section title="Darum ging es">
        <></>
      </Section>,
    );
    // ui_kits/app/More.jsx:77–79: 700 13/18, as written — never capitals.
    const label = screen.getByRole('heading', { name: 'Darum ging es' });
    expect(label.textContent).toBe('Darum ging es');
    expect(own(label).textTransform).not.toBe('uppercase');
    expect(own(label).fontSize).toBe('13px');
    expect(own(label).fontWeight).toBe('700');
    expect(own(label).letterSpacing).not.toBe('0.8px');
  });
});
