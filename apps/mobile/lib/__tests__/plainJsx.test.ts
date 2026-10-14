// The app's JSX is React's own (#637). NativeWind was set up but never used: no `className`
// anywhere, every style through `useTheme()` and `lib/theme`. Its JSX runtime still wrapped every
// View and Text in an interop component with its own hooks — ~5 % of the JS samples of opening
// Settings and of a chat reply on the POCO X3 — and it shipped in the bundle. Styles stay
// tokens (CLAUDE.md, Engineering-Regel 5); a class-name styling layer would be a decision of
// its own, not something left switched on.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('no class-name styling layer', () => {
  it('builds JSX with React’s own runtime', () => {
    const babel = readFileSync(join(ROOT, 'babel.config.js'), 'utf8');
    expect(babel).not.toMatch(/nativewind|jsxImportSource/);
    expect(readFileSync(join(ROOT, 'metro.config.js'), 'utf8')).not.toMatch(/nativewind/);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /nativewind|css-interop|tailwind/.test(d))).toEqual([]);
  });

  it('styles nothing by class name', () => {
    const used = ['app', 'components', 'lib']
      .flatMap((dir) => sources(join(ROOT, dir)))
      .filter((file) => /\bclassName=/.test(readFileSync(file, 'utf8')));
    expect(used).toEqual([]);
  });
});
