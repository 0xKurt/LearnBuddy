// Vercel install step (root package.json postinstall): the workspace packages export their
// TypeScript sources, which the dev tools (tsx, vitest, Metro) load directly but plain Node on
// Vercel cannot. On a Vercel build (VERCEL=1) this compiles each one to dist/ and points its
// package.json at the JavaScript. Anywhere else it does nothing, so a working copy never changes.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL !== '1') process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

for (const name of ['shared-types', 'shared-math', 'shared-maps']) {
  const dir = join(root, 'packages', name);
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '-p',
      join(dir, 'tsconfig.json'),
      '--noEmit',
      'false',
      '--declaration',
      'false',
      '--declarationMap',
      'false',
      '--sourceMap',
      'false',
      '--incremental',
      'false',
      '--rootDir',
      join(dir, 'src'),
      '--outDir',
      join(dir, 'dist'),
    ],
    { stdio: 'inherit', cwd: join(root, 'apps', 'api') },
  );
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const toJs = (p) => p.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '.js');
  pkg.main = toJs(pkg.main);
  pkg.exports = Object.fromEntries(Object.entries(pkg.exports).map(([k, v]) => [k, toJs(v)]));
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`${name}: compiled to dist/, exports now JavaScript`);
}
