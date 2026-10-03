// VexFlow erst laden, wenn eine Notenzeile zu sehen ist (issue #312).
//
// VexFlow mit den Bravura-Umrissen sind rund 155 KB gzip. Notenzeilen gibt es nur in Musik, und
// jeder Start der App, jede Mathe- und jede Vokabelübung würde sie sonst mitladen. `import()`
// macht daraus im Web einen eigenen Bundle-Teil, der beim ersten Bildschirm mit Notenzeile kommt;
// auf dem Gerät liegt ohnehin alles im App-Bundle, und das Laden ist sofort fertig.
//
// Bis es da ist, zeichnet die Zeile nichts — die Geometrie (`geometry.ts`) ist trotzdem schon da,
// die Tippziele der Schreibfläche stimmen also vom ersten Bild an.

import { useEffect, useState } from 'react';

// Nur der Typ: ein Wert-Import zöge VexFlow wieder ins Haupt-Bundle.
import type * as EngraveModule from './engrave.js';

type Engraver = typeof EngraveModule;

let loaded: Engraver | null = null;
let loading: Promise<Engraver> | null = null;

function load(): Promise<Engraver> {
  loading ??= import('./engrave.js').then(
    (mod) => {
      loaded = mod;
      return mod;
    },
    (error: unknown) => {
      // Ein Netzfehler im Web: beim nächsten Bildschirm mit Notenzeile noch einmal versuchen,
      // statt die Zeile für den Rest der Sitzung leer zu lassen.
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Der Stecher, sobald er geladen ist; vorher null. */
export function useEngraver(): Engraver | null {
  const [engraver, setEngraver] = useState<Engraver | null>(loaded);
  useEffect(() => {
    if (engraver) return;
    let live = true;
    load().then(
      (mod) => {
        if (live) setEngraver(mod);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [engraver]);
  return engraver;
}
