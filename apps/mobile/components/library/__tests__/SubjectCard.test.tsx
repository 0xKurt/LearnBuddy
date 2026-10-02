// Die erste Ebene von „Dein Material" (Issue #189) — was auf einer Fachkarte steht, bevor
// sie hineingeht.
//
// Was diese Schicht festhält, ist genau die Zusage, die der Owner gegeben hat und die
// Regel 6 verlangt:
//
//   · die Karte sagt, WAS da ist, indem sie das Neueste benennt — „und mehr", wenn mehr
//     dahinter liegt, und nie eine Zahl: ein Zählstand neben einem Fach liest sich im selben
//     Moment als Pensum („32 Aufgaben offen"), und einer Lernenden wird keiner gezeigt;
//   · ein Fach, in dem nichts ist, behauptet nichts;
//   · sie ist ein Knopf mit Namen und Hinweis, nicht nur eine Fläche, die auf Tippen wartet.
//
// Was diese Schicht nicht sehen kann: Geometrie (jsdom legt nichts aus) und dass der
// `accessibilityHint` auf dem Telefon ankommt — react-native-web schreibt ihn nicht ins DOM
// (docs/testing-layers.md). Dass der Bildschirm auf 390×844 und 360×740 passt, prüft
// tests/web/fit.ts.

import type { LibrarySubject, MaterialView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { SubjectCard } from '../SubjectCard.js';

const sheet = (title: string | null, created_at: string): MaterialView => ({
  id: `m-${title ?? 'x'}-${created_at}`,
  title,
  status: 'ready',
  failure_reason: null,
  photos_deleted: false,
  item_count: 12,
  speak_count: 0,
  subject_name: 'Französisch',
  goal_id: null,
  purpose: 'study',
  session_id: null,
  session_status: null,
  page_problems: [],
  items_incomplete: false,
  not_practicable: [],
  photo_count: 1,
  merged_into: null,
  created_at,
});

const french = (over: Partial<LibrarySubject> = {}): LibrarySubject => ({
  id: 'subject-1',
  name: 'Französisch',
  kind: 'french',
  materials: [],
  exercises: [],
  topics: [],
  ...over,
});

describe('eine Fachkarte in „Dein Material"', () => {
  it('benennt das Neueste zuerst und sagt „und mehr", statt zu zählen', () => {
    renderInApp(
      <SubjectCard
        name="Französisch"
        subject={french({
          materials: [
            sheet('Les vacances', '2026-10-01T10:00:00.000Z'),
            sheet('Passé composé', '2026-09-28T10:00:00.000Z'),
            sheet('Les animaux', '2026-09-20T10:00:00.000Z'),
          ],
        })}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Les vacances · Passé composé · und mehr')).toBeTruthy();
    // Keine Zahl auf der Karte: nicht „3 Blätter", nicht „12 Aufgaben" (Regel 6).
    const card = screen.getByRole('button');
    expect(card.textContent ?? '').not.toMatch(/\d/);
  });

  it('mischt eine getippte Übung nach Datum zwischen die Blätter', () => {
    renderInApp(
      <SubjectCard
        name="Französisch"
        subject={french({
          materials: [sheet('Les vacances', '2026-09-20T10:00:00.000Z')],
          exercises: [
            {
              id: 'e1',
              title: 'Vokabeln Unit 3',
              status: 'active',
              started_at: '2026-10-01T10:00:00.000Z',
            },
          ],
        })}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Vokabeln Unit 3 · Les vacances')).toBeTruthy();
  });

  it('zeigt im Blick hinein, was einen eigenen Namen hat — nicht „Üben" vor dem Blatt', () => {
    renderInApp(
      <SubjectCard
        name="Mathe"
        subject={french({
          name: 'Mathe',
          kind: 'math',
          materials: [sheet('Brüche kürzen', '2026-09-20T10:00:00.000Z')],
          // Die vorbereitete Übung hat keinen eigenen Titel: sie stünde sonst vorn und
          // sagte nichts darüber, was in dem Fach zu finden ist.
          exercises: [
            { id: 'e1', title: null, status: 'finished', started_at: '2026-10-01T10:00:00.000Z' },
          ],
        })}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Brüche kürzen · und mehr')).toBeTruthy();
  });

  it('sagt bei einem leeren Fach, dass noch nichts da ist — und behauptet nichts', () => {
    renderInApp(<SubjectCard name="Französisch" subject={french()} onPress={() => undefined} />);
    expect(screen.getByText('Noch nichts dazu')).toBeTruthy();
  });

  it('nennt ein Blatt ohne Titel beim Namen, den die Liste dafür hat', () => {
    renderInApp(
      <SubjectCard
        name="Französisch"
        subject={french({ materials: [sheet(null, '2026-10-01T10:00:00.000Z')] })}
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Ohne Titel')).toBeTruthy();
  });

  it('ist ein Knopf, dessen Name das Fach und den Blick hinein trägt, und öffnet auf Tippen', () => {
    const onPress = vi.fn();
    renderInApp(<SubjectCard name="Ohne Fach" subject={null} onPress={onPress} />);
    const card = screen.getByRole('button', { name: 'Ohne Fach: Noch nichts dazu' });
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
