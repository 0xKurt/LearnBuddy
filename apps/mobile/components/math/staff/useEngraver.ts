// VexFlow erst laden, wenn eine Notenzeile zu sehen ist (issue #312).
//
// VexFlow mit den Bravura-Umrissen sind rund 155 KB gzip. Notenzeilen gibt es nur in Musik, und
// jeder Start der App, jede Mathe- und jede Vokabelübung würde sie sonst mitladen. `import()`
// macht daraus im Web einen eigenen Bundle-Teil, der beim ersten Bildschirm mit Notenzeile kommt
// (`lib/lazyModule.ts`, dasselbe für die Kartenformen, #251).
//
// Bis es da ist, zeichnet die Zeile nichts — die Geometrie (`geometry.ts`) ist trotzdem schon da,
// die Tippziele der Schreibfläche stimmen also vom ersten Bild an.

import { lazyModule } from '../../../lib/lazyModule.js';

/** Der Stecher, sobald er geladen ist; vorher null. */
export const useEngraver = lazyModule(() => import('./engrave.js'));
