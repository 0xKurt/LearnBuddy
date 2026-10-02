// Regenerates public/index.html from the palettes. See write-web-shell.mjs for why.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellHtml } from './write-web-shell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { GROUNDS } = await import(resolve(here, '../lib/theme/ground.ts'));
const { FAMILIES, DEFAULT_MODE } = await import(resolve(here, '../lib/theme/palettes.ts'));
const out = resolve(here, '../public/index.html');
writeFileSync(out, shellHtml(GROUNDS, [...FAMILIES], DEFAULT_MODE));
console.info(`wrote ${out}`);
