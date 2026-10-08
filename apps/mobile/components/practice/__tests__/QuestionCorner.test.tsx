// Die stille Ecke der Fortschrittszeile (Issue #164, #459): „Frage passt nicht“, solange die Frage
// offen ist, danach „Einspruch gegen die Bewertung“ — nie beide, nie eine Zahl.
//
// Was hier festgehalten wird, ist, was #459 kaputt fand: der volle Satz stand sichtbar in der Zeile
// und drückte bei 360 „Frage 2 von 5“ auf zwei Zeilen. Jetzt steht ein kurzes Wort da und der
// Screenreader hört die ganze Aktion — mit dem sichtbaren Wort darin, damit sie sagen kann, was sie
// sieht (WCAG 2.5.3). Ob die Zeile wirklich passt, misst der Rundgang (`progressHead` in
// tests/web/fit.ts) bei 360 und 390; jsdom kennt keine Breiten.
//
// `accessibilityHint` landet durch react-native-web nicht im DOM (DisputeVerdict.test.tsx); hier
// zählt, was ankommt: Name, Rolle, sichtbarer Text und dass ein wartender Knopf keinen Tipp annimmt.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resources, SUPPORTED_LOCALES } from '../../../lib/i18n/resources.js';
import { renderInApp } from '../../../testing/render.js';
import { QuestionCorner } from '../QuestionCorner.js';

function corner(over: { flaggable?: boolean; canDispute?: boolean; disabled?: boolean } = {}) {
  const onFlag = vi.fn();
  const onDispute = vi.fn();
  renderInApp(
    <QuestionCorner
      flaggable={over.flaggable ?? false}
      canDispute={over.canDispute ?? false}
      disabled={over.disabled ?? false}
      onFlag={onFlag}
      onDispute={onDispute}
    />,
  );
  return { onFlag, onDispute };
}

describe('die Ecke an der Frage', () => {
  it('bietet am gefällten Urteil den Einspruch an — kurz zu sehen, ganz zu hören', () => {
    const { onDispute, onFlag } = corner({ canDispute: true });
    const button = screen.getByRole('button', { name: 'Einspruch gegen die Bewertung' });
    expect(button.textContent).toBe('Einspruch');
    // Nie eine Zahl: kein Zähler von Fälligem, Verpasstem oder Bestrittenem (Regel 6).
    expect(button.textContent ?? '').not.toMatch(/\d/);
    fireEvent.click(button);
    expect(onDispute).toHaveBeenCalledTimes(1);
    expect(onFlag).not.toHaveBeenCalled();
  });

  it('nimmt eine offene Frage raus, die nicht passt — die Fahne gewinnt', () => {
    const { onFlag, onDispute } = corner({ flaggable: true, canDispute: true });
    const button = screen.getByRole('button', { name: 'Frage passt nicht' });
    expect(button.textContent).toBe('Passt nicht');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(button);
    expect(onFlag).toHaveBeenCalledTimes(1);
    expect(onDispute).not.toHaveBeenCalled();
  });

  it('steht leer, wo es nichts zu bestreiten und nichts rauszunehmen gibt', () => {
    corner();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('wartet, während etwas anderes läuft, statt zweimal zu zählen', () => {
    const { onDispute } = corner({ canDispute: true, disabled: true });
    const button = screen.getByRole('button', { name: 'Einspruch gegen die Bewertung' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onDispute).not.toHaveBeenCalled();
  });
});

/**
 * So viele Zeichen darf das Wort auf dem Schirm haben, in jeder Sprache. Die Zeile hält bei 360
 * „Question 12 sur 15“ (etwa 130 pt), zwei Abstände, die 48 pt des Balkens und den Innenrand des
 * Knopfs: für das Wort bleiben etwa 95 pt — zwölf Zeichen in 15 pt halbfett, gemessen im Chromium
 * des Rundgangs. Ein längeres Wort drückt wieder auf das Label oder den Balken (Issue #459).
 */
const WORD_MAX = 12;

describe.each(SUPPORTED_LOCALES)('die Ecke auf %s', (lang) => {
  it.each(['flag', 'dispute'] as const)('%s: ein kurzes Wort, das im vollen Namen steht', (key) => {
    const { button, label } = resources[lang].practice[key];
    expect(button.length, `${lang} ${key}.button "${button}"`).toBeLessThanOrEqual(WORD_MAX);
    expect(label.toLocaleLowerCase(lang)).toContain(button.toLocaleLowerCase(lang));
    expect(label.length).toBeGreaterThan(button.length);
  });
});
