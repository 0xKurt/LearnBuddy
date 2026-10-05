// One tap surface (issue #416, Engineering-Regel 3 "Keine Kopien"): exactly one component reads
// where a finger is and hands that place to its caller — `components/lb/TapSurface.tsx`, tapped
// (note line, grid) or dragged (a figure, a map). Read from the source like `oneInput.test.ts`:
// a second file that reads a touch's position (`locationX`/`locationY`, a gesture's `e.x`/`e.y`)
// is a second tap surface in the making.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

function sources(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name)
      ? [{ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];
/** A touch's place: a press event's `locationX`/`locationY`, or `x`/`y` of a gesture's event. */
function readsPlace(text: string): boolean {
  const code = text.replace(/\/\/.*$/gm, '');
  if (/\blocation[XY]\b/.test(code)) return true;
  return (
    code.includes("from 'react-native-gesture-handler'") &&
    /\.on\w+\(\(?(\w+)\)? =>[\s\S]{0,240}?\b\1\.[xy]\b/.test(code)
  );
}

describe('one tap surface (#416)', () => {
  it('is the only place that reads where a finger is', () => {
    expect(
      app
        .filter((s) => readsPlace(s.text))
        .map((s) => s.file)
        .sort(),
    ).toEqual([
      'components/lb/TapSurface.tsx',
      // A double tap zooms around the finger: the place stays inside the viewer, no answer.
      'components/lb/ZoomViewer.tsx',
    ]);
  });
});
