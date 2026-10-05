// Was eine Blattkarte anbietet — und vor allem, was sie NICHT anbietet (Issue #223 Punkt 2).
//
// Die Sätze eines Blatts laut zu lesen ist seit #223 erreichbar, und zwar genau dort, wo das
// Blatt schon „Üben" anbietet. Drei Zusagen hält diese Schicht fest:
//
//   · ein Blatt ohne Vorlesesätze sagt nichts davon — kein Knopf, der ins Leere führt;
//   · ein Blatt mit beidem bietet beides an, und die Beschriftung sagt, was es ist;
//   · ein Blatt, dessen Aufgaben ALLE Vorlesesätze sind, bietet kein „Üben" an: dort gäbe es
//     nichts zu üben, und der Server würde mit „nichts zu üben" antworten.
//
// Was diese Schicht nicht sehen kann: Geometrie (jsdom legt nichts aus) und ob die Aufnahme auf
// dem Telefon funktioniert (docs/testing-layers.md).

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { MaterialCard } from '../MaterialCard.js';

const sheet = (over: Partial<MaterialView> = {}): MaterialView => ({
  id: 'm-1',
  title: 'Unité 3',
  status: 'ready',
  failure_reason: null,
  photos_deleted: false,
  item_count: 5,
  speak_count: 0,
  subject_name: 'Französisch',
  goal_id: null,
  purpose: 'study',
  source: 'sheet',
  session_id: null,
  session_status: null,
  page_problems: [],
  items_incomplete: false,
  not_practicable: [],
  photo_count: 1,
  merged_into: null,
  created_at: '2026-10-02T09:00:00.000Z',
  ...over,
});

function show(material: MaterialView) {
  const onPractice = vi.fn();
  const onSpeak = vi.fn();
  renderInApp(
    <MaterialCard
      material={material}
      tone="lavender"
      busy={false}
      disabled={false}
      onPractice={onPractice}
      onSpeak={onSpeak}
      onOpen={vi.fn()}
      onRetry={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return { onPractice, onSpeak };
}

describe('eine Blattkarte und die Sätze zum Vorlesen (Issue #223 Punkt 2)', () => {
  it('sagt nichts vom Vorlesen, wenn das Blatt keine Sätze dafür hat', () => {
    show(sheet());
    expect(screen.getByText('Üben')).toBeTruthy();
    expect(screen.queryByText('Sätze laut lesen')).toBeNull();
  });

  it('bietet beides an, wenn das Blatt geschriebene Aufgaben und Vorlesesätze hat', () => {
    const { onPractice, onSpeak } = show(sheet({ item_count: 5, speak_count: 3 }));
    fireEvent.click(screen.getByText('Üben'));
    expect(onPractice).toHaveBeenCalledTimes(1);
    expect(onSpeak).not.toHaveBeenCalled();
    // Die Beschriftung sagt, was passiert; die Vorlesezeile nennt das Blatt dazu.
    fireEvent.click(screen.getByText('Sätze laut lesen'));
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Die Sätze aus „Unité 3“ laut lesen')).toBeTruthy();
  });

  it('macht das Vorlesen zur Hauptaktion, wenn das Blatt nur daraus besteht', () => {
    const { onPractice, onSpeak } = show(sheet({ item_count: 2, speak_count: 2 }));
    // Kein „Üben", das auf „hier gibt es gerade nichts zu üben" laufen würde.
    expect(screen.queryByText('Üben')).toBeNull();
    fireEvent.click(screen.getByText('Sätze laut lesen'));
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onPractice).not.toHaveBeenCalled();
  });

  it('bietet bei einer Hausaufgabe weiter nur deren eigenen Weg an', () => {
    // Hausaufgaben werden geholfen, nicht abgefragt (Audit H-7) — auch wenn jemand die Zahl
    // von Hand setzt, steht hier nie ein Vorlese-Knopf.
    show(sheet({ purpose: 'homework', speak_count: 2, session_status: null }));
    expect(screen.getByText('Weiter mit der Hausaufgabe')).toBeTruthy();
    expect(screen.queryByText('Sätze laut lesen')).toBeNull();
  });
});

describe('eine korrigierte Arbeit ohne Angestrichenes (Issue #259)', () => {
  it('sagt, warum es nichts zu üben gibt, ohne Nochmal-lesen und ohne Warnung zum Foto', () => {
    show(
      sheet({
        source: 'corrected_test',
        status: 'failed',
        failure_reason: 'nothing_marked',
        item_count: 0,
        // Die Fotos sind sofort weg (eine Note steht darauf): das ist kein "nicht mehr gespeichert".
        photos_deleted: true,
      }),
    );
    expect(screen.getByText('ohne Übungen')).toBeTruthy();
    expect(screen.getByText(/nichts gefunden, was als falsch angestrichen ist/)).toBeTruthy();
    expect(screen.queryByText('Nochmal lesen')).toBeNull();
    expect(screen.queryByText(/nicht mehr gespeichert/)).toBeNull();
  });
});
