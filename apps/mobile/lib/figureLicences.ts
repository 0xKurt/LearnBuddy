// The licences of the pictures in the tasks (issue #599): every image of the picture library
// (`assets/figures/*.png`) and every single element of the row pictures
// (`assets/figures/parts/*.png`) comes from someone else — Wikimedia Commons, Servier, Twemoji,
// Bioicons — and each asks to be named: its title, its author, its licence, where it is from and
// whether we changed it. The two `sources.json` files beside the images are the source, as the
// design package delivered them and never written by hand here; this module only reads them into
// one list for the Lizenzen page (section "Abbildungen in den Aufgaben", design `Flows.jsx ›
// Licences`; components/settings/LicencesPage.tsx). Every entry of both files is in it and on the
// page — an image without an entry, or an entry without its image, is red in
// `__tests__/figureLicences.test.ts`.
//
// `attribution` is the finished sentence each source asks for ("… von …, CC BY 4.0 (…), Quelle: …
// – bearbeitet."); it is shown as it stands. Load it on demand (`lazyModule`), like the packages'
// licences (`lib/licences.ts`): nobody opening the app to practise needs it.

import parts from '../assets/figures/parts/sources.json';
import figures from '../assets/figures/sources.json';

/** One source as `sources.json` writes it (the design package's German keys). */
type Source = {
  datei: string;
  abbildung: string;
  teil?: string;
  titel: string;
  autor: string;
  lizenz: string;
  lizenzUrl: string;
  quelle: string;
  bearbeitet: string;
  namensnennung: string;
};

export type FigureLicence = {
  /**
   * The image files this source is in, as paths under `assets/figures/` — more than one where two
   * pictures share an image ("eye.png, eye_front.png").
   */
  files: readonly string[];
  /** The picture of the library it belongs to (`SCHEMATIC_IDS`), and its element in a row picture. */
  figure: string;
  part: string | null;
  title: string;
  author: string;
  /** The licence's name as the source states it ("CC BY-SA 3.0", "Public domain"). */
  licence: string;
  /** Where the licence can be read; null where the work is in the public domain without a deed. */
  licenceUrl: string | null;
  /** Where the original is. */
  source: string;
  /** What we changed ("ja: zugeschnitten, auf 900 px skaliert, Hintergrund transparent"). */
  edited: string;
  /** The finished sentence naming all of it. */
  attribution: string;
};

/** "eye.png, eye_front.png" → both; "flower.png, (auch für flower_section)" → the one file. */
const filesOf = (datei: string): string[] => datei.match(/[\w/-]+\.png/g) ?? [];

const licenceOf = (s: Source): FigureLicence => ({
  files: filesOf(s.datei),
  figure: s.abbildung,
  part: s.teil ?? null,
  title: s.titel,
  author: s.autor,
  licence: s.lizenz,
  licenceUrl: s.lizenzUrl === '' ? null : s.lizenzUrl,
  source: s.quelle,
  edited: s.bearbeitet,
  attribution: s.namensnennung,
});

/** Every entry of both files: the pictures' sources first, then those of the single elements. */
export const FIGURE_LICENCES: readonly FigureLicence[] = [...figures, ...parts].map(licenceOf);
