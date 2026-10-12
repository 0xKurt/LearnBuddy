// One question in „Dein Material" (issue #297, Schnitt 4): a part of a task in parts names its
// letter, as the sheet prints it, and the first part of the task carries its material above it —
// a later part does not repeat it. A question of no task stands as before.

import { MaterialItemView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { MaterialItemCard } from '../MaterialItemCard.js';

const STEM = 'Ein Schwimmbecken fasst 450 m³ Wasser. Eine Pumpe füllt pro Stunde 25 m³ nach.';

const question = (prompt: string, part: 'a' | 'b' | null) =>
  MaterialItemView.parse({
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'numeric',
    prompt,
    choices: null,
    unit: 'm³',
    topic: null,
    origin: 'material',
    lang: null,
    prompt_lang: null,
    figure: null,
    image: null,
    task_part: part ? { ref: 'p1', part, letters: ['a', 'b'], stem: STEM } : null,
    result: 'never_asked',
  });

const card = (item: MaterialItemView) => (
  <MaterialItemCard item={item} number={1} disabled={false} onDelete={() => undefined} />
);

describe('a question in „Dein Material"', () => {
  it('names the first part with its letter, under the task’s material', () => {
    renderInApp(card(question('Wie viel Wasser fehlt noch?', 'a')));
    expect(screen.getByText(STEM)).toBeDefined();
    expect(screen.getByText('a) Wie viel Wasser fehlt noch?')).toBeDefined();
  });

  it('names a later part with its letter, without repeating the material', () => {
    renderInApp(card(question('Wie lange braucht die Pumpe?', 'b')));
    expect(screen.queryByText(STEM)).toBeNull();
    expect(screen.getByText('b) Wie lange braucht die Pumpe?')).toBeDefined();
  });

  it('shows a question of no task as it is', () => {
    renderInApp(card(question('Wie viele Liter sind 1 m³?', null)));
    expect(screen.getByText('Wie viele Liter sind 1 m³?')).toBeDefined();
  });
  it('retains all actual choices, supplied figure and delete callback', () => {
    const item = MaterialItemView.parse({
      ...question('Welche Darstellung passt?', null),
      kind: 'multiple_choice',
      choices: ['Sechs Punkte', 'Acht Punkte'],
      figure: { type: 'dot_field', field: 'twenty', n: [8], ask: 'count' },
      topic: 'Anzahlen',
      result: 'first_try',
    });
    const onDelete = vi.fn();
    renderInApp(<MaterialItemCard item={item} number={3} disabled={false} onDelete={onDelete} />);
    expect(screen.getByText('Welche Darstellung passt?')).toBeTruthy();
    expect(screen.getByText('Sechs Punkte')).toBeTruthy();
    expect(screen.getByText('Acht Punkte')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Zwanzigerfeld.*8 Punkte/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Frage 3 löschen' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
