// Every picture in the tasks is named with its licence (issue #599, owner rule 3): the images of
// the picture library are other people's work, and each licence asks for its attribution. This
// holds the list the Lizenzen page shows to the files that are really shipped — an image without
// a source, or a source without its image, is red — and each entry to what an attribution needs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SCHEMATIC_IMAGE_IDS } from '../../../../packages/shared-math/src/schematics.js';
import { FIGURE_LICENCES, figureLinks } from '../figureLicences.js';

const FIGURES = join(__dirname, '../../assets/figures');
const read = (file: string): unknown => JSON.parse(readFileSync(join(FIGURES, file), 'utf8'));

/** Every image under assets/figures, as a path from there ("heart.png", "parts/signs-stop.png"). */
const IMAGES = ['', 'parts/'].flatMap((dir) =>
  readdirSync(join(FIGURES, dir))
    .filter((name) => name.endsWith('.png'))
    .map((name) => `${dir}${name}`),
);

describe('the licences of the pictures', () => {
  it('both sources.json files have the shape the list is read from', () => {
    const Source = z.strictObject({
      datei: z.string().min(1),
      abbildung: z.string().min(1),
      teil: z.string().min(1).optional(),
      titel: z.string().min(1),
      autor: z.string().min(1),
      lizenz: z.string().min(1),
      // Empty only for a work in the public domain: there is no deed to link to.
      lizenzUrl: z.union([z.literal(''), z.string().url()]),
      quelle: z.string().url(),
      bearbeitet: z.string().min(1),
      namensnennung: z.string().min(1),
    });
    const figures = z.array(Source).parse(read('sources.json'));
    const parts = z.array(Source).parse(read('parts/sources.json'));
    expect([figures.length, parts.length]).toEqual([53, 24]);
    for (const s of [...figures, ...parts]) {
      if (s.lizenzUrl === '') expect(s.lizenz, s.datei).toBe('Public domain');
    }
  });

  it('every entry of both files is in the list, with all an attribution needs', () => {
    expect(FIGURE_LICENCES).toHaveLength(53 + 24);
    for (const l of FIGURE_LICENCES) {
      const where = l.files.join();
      expect(l.files.length, l.title).toBeGreaterThan(0);
      for (const text of [l.title, l.author, l.licence, l.source, l.edited, l.attribution]) {
        expect(text.trim(), where).not.toBe('');
      }
      // The sentence names the author, the licence's own name where it has a deed, and the source.
      expect(l.attribution, where).toContain(l.author);
      expect(l.attribution, where).toContain(l.source);
      if (l.licenceUrl) expect(l.attribution, where).toContain(l.licence);
      // Every image was at least cut and scaled: the sentence says that it was changed.
      expect(l.edited, where).toMatch(/^ja\b/);
      expect(l.attribution, where).toMatch(/bearbeitet\.$/);
    }
  });

  it('every image file has a source, and every source its image file', () => {
    const named = new Set(FIGURE_LICENCES.flatMap((l) => l.files));
    expect(IMAGES.filter((file) => !named.has(file))).toEqual([]);
    expect([...named].filter((file) => !existsSync(join(FIGURES, file)))).toEqual([]);
    expect(IMAGES).toHaveLength(33 + 24);
  });

  it('every picture of the library that is an image is named, each single element with its part', () => {
    const named = new Set(FIGURE_LICENCES.flatMap((l) => l.files));
    // `flower_section` shows the flower's image: its source is the flower's entry.
    const imageOf = (d: string) => (d === 'flower_section' ? 'flower' : d);
    expect(SCHEMATIC_IMAGE_IDS.filter((d) => !named.has(`${imageOf(d)}.png`))).toEqual([]);
    for (const l of FIGURE_LICENCES) {
      const single = l.files.every((f) => f.startsWith('parts/'));
      expect(l.part !== null, l.files.join()).toBe(single);
      if (l.part) expect(l.files).toEqual([`parts/${l.figure}-${l.part}.png`]);
    }
  });

  it('the licences are the ones the decision was taken for (docs/adr/0009)', () => {
    const count = (licence: string) => FIGURE_LICENCES.filter((l) => l.licence === licence).length;
    const names = [...new Set(FIGURE_LICENCES.map((l) => l.licence))];
    expect(Object.fromEntries(names.map((name) => [name, count(name)]))).toEqual({
      'Public domain': 21,
      CC0: 16,
      'CC BY 2.5': 1,
      'CC BY 3.0': 2,
      'CC BY 4.0': 31,
      'CC BY-SA 3.0': 5,
      'CC BY-SA 4.0': 1,
    });
  });

  // What a row of the Lizenzen page offers under its text (#599): held against the files, entry
  // by entry — a licence with a deed must never stand there without the way to it.
  it('every entry with a `lizenzUrl` offers its licence, and every entry its source', () => {
    const Raw = z.array(z.object({ lizenzUrl: z.string(), quelle: z.string() }));
    const raw = [...Raw.parse(read('sources.json')), ...Raw.parse(read('parts/sources.json'))];
    expect(raw).toHaveLength(FIGURE_LICENCES.length);
    let withDeed = 0;
    raw.forEach((s, i) => {
      const links = figureLinks(FIGURE_LICENCES[i]!);
      const where = `${i}: ${s.quelle}`;
      expect(links.at(-1), where).toEqual({ kind: 'source', url: s.quelle });
      if (s.lizenzUrl === '') {
        // In the public domain: there is no deed to lead to.
        expect(links, where).toHaveLength(1);
        return;
      }
      withDeed += 1;
      expect(links, where).toEqual([
        { kind: 'licence', url: s.lizenzUrl },
        { kind: 'source', url: s.quelle },
      ]);
    });
    // Everything but the 21 works in the public domain (the skeleton since #820).
    expect(withDeed).toBe(56);
  });
});
