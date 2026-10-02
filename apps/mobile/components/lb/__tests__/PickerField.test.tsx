// Das Pflichtfeld „Bundesland" bei der Registrierung (issue #199) und das Feld, durch das es
// gestellt wird.
//
// Warum es das überhaupt gibt: An zwölf belegten Stellen in docs/lehrplan-und-uebungsformen.md
// ist dieselbe Antwort in einem Bundesland richtig und im anderen falsch — die Satzglieder
// eines Satzes haben vier verschiedene Erwartungshorizonte, „vergleichen" verlangt in Bayern
// ein abschließendes Urteil und in Niedersachsen ausdrücklich keines. Ein geratener Wert ist
// deshalb schlimmer als keiner, und genau das hält diese Datei fest: Es ist nichts
// vorausgewählt, und der Knopf wartet, bis getippt wurde.
//
// Was diese Schicht nicht sehen kann: ob die Seite auf ein 360×740-Telefon passt. jsdom legt
// nichts aus; das misst tests/web/fit.ts.

import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import deAuth from '../../../locales/de/auth.json';
import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { PickerField, picked } from '../PickerField.js';

/**
 * Die Namen, die sie liest, kommen aus den Locale-Dateien — nie aus dem Enum (Regel 2). Also
 * liest dieser Test sie dort, wo der Bildschirm sie auch liest: ein fehlender Name fällt hier
 * auf, nicht erst auf dem Telefon.
 */
const NAMES: Record<string, string> = deAuth.region.names;

const options = CurriculumRegion.options.map((value) => ({ value, label: NAMES[value] ?? value }));

const FIELD = {
  label: 'Bundesland',
  placeholder: 'Bundesland wählen',
  title: 'In welchem Bundesland gehst du zur Schule?',
  body: 'Bei manchen Aufgaben zählt in Bayern eine andere Lösung als in Niedersachsen.',
};

describe('ob die Frage beantwortet ist', () => {
  it('ist sie nicht, solange nichts getippt wurde — kein Vorgabewert', () => {
    expect(picked(null)).toBe(false);
    expect(picked(undefined)).toBe(false);
  });

  it('ist sie, sobald eines der Länder gewählt ist', () => {
    expect(picked('ni')).toBe(true);
    // Auch die Ausweichantwort für eine Schule außerhalb Deutschlands ist eine Antwort.
    expect(picked('other')).toBe(true);
  });
});

describe('die Liste im Code und die Namen in den Texten', () => {
  it('hat für jeden Schlüssel einen deutschen Namen — und keinen Schlüssel als Namen', () => {
    // Ein neuer Schlüssel im Enum ohne Eintrag in auth.json fällt hier auf. Die anderen vier
    // Sprachen deckt lib/i18n/__tests__/parity.test.ts ab.
    for (const value of CurriculumRegion.options) {
      const name = NAMES[value];
      expect(name, `auth:region.names.${value}`).toBeTypeOf('string');
      expect((name ?? '').trim().length, `auth:region.names.${value} ist leer`).toBeGreaterThan(0);
      expect(name).not.toBe(value);
    }
    expect(CurriculumRegion.options).toHaveLength(17);
  });
});

describe('das geschlossene Feld', () => {
  function render(value: (typeof options)[number]['value'] | null, onChange = vi.fn()) {
    renderInApp(<PickerField {...FIELD} options={options} value={value} onChange={onChange} />);
    return onChange;
  }

  it('fragt, solange nichts gewählt ist — und sagt beim Namen, worum es geht', () => {
    render(null);
    const field = screen.getByRole('button', { name: FIELD.placeholder });
    expect(field.textContent).toBe(FIELD.placeholder);
  });

  it('zeigt das gewählte Land und nennt im Vorlesen das Feld dazu', () => {
    render('ni');
    // Auf dem Feld steht nur der Name: „Bundesland: Mecklenburg-Vorpommern" passt auf einem
    // 360 pt breiten Telefon nicht in eine Zeile. Vorgelesen wird beides.
    const field = screen.getByRole('button', { name: 'Bundesland: Niedersachsen' });
    expect(field.textContent).toBe('Niedersachsen');
  });

  it('öffnet erst auf Tippen die Liste: vorher ist keine Auswahl auf dem Schirm', () => {
    render(null);
    expect(screen.queryByRole('radio', { name: 'Niedersachsen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: FIELD.placeholder }));
    expect(screen.getByRole('radio', { name: 'Niedersachsen' })).toBeDefined();
  });
});

describe('die Liste', () => {
  function open(value: (typeof options)[number]['value'] | null = null) {
    const onChange = vi.fn();
    renderInApp(<PickerField {...FIELD} options={options} value={value} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: value === null ? FIELD.placeholder : `Bundesland: ${NAMES[value]}`,
      }),
    );
    return onChange;
  }

  it('stellt die Frage und sagt, warum sie gestellt wird', () => {
    open();
    expect(screen.getByText(FIELD.title)).toBeDefined();
    expect(screen.getByText(FIELD.body)).toBeDefined();
  });

  it('hat die sechzehn Länder und die Ausweichantwort, jedes als Auswahlknopf', () => {
    open();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(17);
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(
      CurriculumRegion.options.map((v) => NAMES[v]),
    );
    // Niemand ist vorausgewählt (Regel 2: nichts wird geraten).
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('sagt beim Gewählten, dass es gewählt ist — nicht nur durch die Farbe', () => {
    open('by');
    const chosen = screen
      .getAllByRole('radio')
      .find((r) => r.getAttribute('aria-label') === NAMES.by);
    expect(chosen?.getAttribute('aria-checked')).toBe('true');
  });

  it('hat einen sichtbaren Weg heraus (Regel 14)', () => {
    open();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeDefined();
  });

  it('gibt den Maschinenschlüssel weiter, nicht den gelesenen Namen', () => {
    const onChange = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Niedersachsen' }));
    // 'ni' geht an den Server, „Niedersachsen" nur an sie: der Name kommt aus den
    // Locale-Dateien und darf sich ändern, der Schlüssel nie.
    expect(onChange).toHaveBeenCalledWith('ni');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // Dass sich die Lade danach wieder schließt, kann diese Schicht nicht sehen: die Lade bleibt
  // beim Schließen montiert, bis ihre Ausblendung fertig ist, und die Reanimated-Attrappe
  // (testing/reanimated.tsx) meldet dieses Ende nie. Gesehen wird es im Browser-Durchgang.
});

/**
 * Die eigentliche Regel des Issues, an dem Knopf, an dem sie hängt (app/profile.tsx): Ohne
 * Bundesland kein „Los geht's". Hier steht sie als Baustein, den der Bildschirm genauso
 * zusammensetzt — gemessen wird, dass der Knopf wirklich wartet und nach dem Tippen losgeht.
 */
function Registration() {
  const [region, setRegion] = useState<(typeof options)[number]['value'] | null>(null);
  return (
    <>
      <PickerField {...FIELD} options={options} value={region} onChange={setRegion} />
      <Btn full disabled={!picked(region)} onPress={() => undefined}>
        Los geht&apos;s
      </Btn>
    </>
  );
}

describe('der Knopf bei der Registrierung', () => {
  it('wartet, solange kein Bundesland gewählt ist, und geht danach los', () => {
    renderInApp(<Registration />);
    const cta = screen.getByRole('button', { name: "Los geht's" });
    expect(cta.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: FIELD.placeholder }));
    fireEvent.click(screen.getByRole('radio', { name: 'Thüringen' }));

    expect(screen.getByRole('button', { name: 'Bundesland: Thüringen' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: "Los geht's" }).getAttribute('aria-disabled'),
    ).not.toBe('true');
  });
});
