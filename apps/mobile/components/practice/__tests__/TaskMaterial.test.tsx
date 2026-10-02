// Das Material einer Aufgabe mit Teilaufgaben (issue #297): derselbe Panel wie der Lesetext, mit
// Figur und einer ruhigen a · b · c-Anzeige. Was hier festgehalten wird:
//
//   · Material ohne eigene Überschrift heißt „Material", und eingeklappt sagt der Knopf
//     „Material zeigen";
//   · a · b · c steht in der ersten Zeile der Frage, zu der es gehört;
//   · die Figur steht unter den Zeilen, im selben Panel;
//   · die Anzeige zählt nicht: keine Zahl, kein „von"; ein Screenreader hört die aktuelle
//     Teilaufgabe und welche erledigt sind.
//
// Ob Material und Frage auf 360×740 zusammen passen, misst der Walkthrough (tests/web/fit.ts).

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { PassagePanel } from '../PassagePanel.js';
import { QuestionCard } from '../Question.js';
import { TaskSteps } from '../TaskSteps.js';

const steps = <TaskSteps labels={['a', 'b', 'c']} current="b" done={new Set(['a'])} />;

describe('the material of a task with several parts', () => {
  it('names itself, and says how to open it when folded', () => {
    renderInApp(
      <PassagePanel
        passage={{ title: null, lines: ['Lena fährt 100 m in 8 s.'] }}
        label="Material"
        showLabel="Material zeigen"
        open={false}
        onToggle={() => undefined}
        maxHeight={200}
        highlight={null}
      />,
    );
    expect(screen.getByText('Material')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Material zeigen' })).toBeDefined();
    expect(screen.queryByText('Lena fährt 100 m in 8 s.')).toBeNull();
  });

  it('draws its figure under its lines', () => {
    renderInApp(
      <PassagePanel
        passage={{ title: 'Messwerte', lines: ['Die Tabelle zeigt die Werte.'] }}
        figure={{
          type: 'table',
          header: ['t in s', 's in m'],
          rows: [
            ['0', '0'],
            ['8', '100'],
          ],
        }}
        open
        onToggle={() => undefined}
        maxHeight={200}
        highlight={null}
      />,
    );
    expect(screen.getByText('Die Tabelle zeigt die Werte.')).toBeDefined();
    // The figure is there, zoomable, with its description for a screen reader.
    expect(screen.getAllByLabelText(/^Abbildung: /).length).toBeGreaterThan(0);
  });
});

describe('a · b · c', () => {
  it('stands in the first row of the part it belongs to, the prompt without a letter', () => {
    renderInApp(
      <QuestionCard prompt="Berechne die Energie." topic={null} fromBuddy steps={steps} />,
    );
    expect(screen.getByTestId('task-steps')).toBeDefined();
    expect(screen.getByText('Berechne die Energie.')).toBeDefined();
  });

  it('shows the letters and no count, and says where she is', () => {
    renderInApp(steps);
    for (const l of ['a', 'b', 'c']) expect(screen.getByText(l)).toBeDefined();
    const said = screen.getByTestId('task-steps').getAttribute('aria-label') ?? '';
    expect(said).toBe('Teilaufgabe b, erledigt: a');
    expect(screen.getByTestId('task-steps').textContent).not.toMatch(/\d|von/);
  });
});
