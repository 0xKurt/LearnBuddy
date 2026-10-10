// pnpm provision [--dry-run] [--env production] [--set key=value …] [--rotate NAME]
//                [--check-health] [--deprovision-plan]
// --dry-run (alias --plan): what would be created and changed; nothing is written or called.
// Run in the root of a project created by create-buddy (issue #107 §3).

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { KitError, parseConfig } from '../config.js';
import { inventory, renderInventory } from '../inventory.js';
import { checkHealth, NOT_DELETABLE, provision, renderResult } from '../provision.js';
import { parseAssignment, readState, type SecretName } from '../state.js';
import { parseArgs } from './args.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), ['env', 'set', 'rotate']);
  const root = resolve(process.env.INIT_CWD ?? process.cwd());
  const configPath = join(root, 'buddy.config.json');
  if (!existsSync(configPath))
    throw new KitError(
      `no buddy.config.json in ${root} — run this in a project made by create-buddy`,
    );
  const config = parseConfig(JSON.parse(readFileSync(configPath, 'utf8')));

  if (args.flags.has('deprovision-plan')) {
    console.log('Nicht löschbar, auch nicht von Hand:');
    for (const n of NOT_DELETABLE) console.log(`  - ${n}`);
    console.log(
      'Alles andere (Supabase-, Vercel-, Expo-Projekt) löscht der Owner in der jeweiligen Konsole.',
    );
    return;
  }

  const env = args.values.get('env')?.at(-1) ?? 'development';
  if (env !== 'development' && env !== 'production')
    throw new KitError(`--env is development or production, not "${env}"`);
  const write = !args.flags.has('plan') && !args.flags.has('dry-run');
  const result = provision({
    root,
    config,
    env,
    write,
    set: (args.values.get('set') ?? []).map(parseAssignment),
    rotate: (args.values.get('rotate') ?? []) as SecretName[],
    now: () => new Date(),
  });
  if (!write) console.log(`${renderInventory(inventory(root, config, result.ids))}\n`);
  console.log(renderResult(result, { write }));

  if (args.flags.has('check-health')) {
    const apiUrl = readState(root).ids.apiUrl;
    if (!apiUrl)
      throw new KitError('--check-health needs apiUrl (pnpm provision --set apiUrl=https://…)');
    const health = await checkHealth(apiUrl);
    console.log(`\n${health.ok ? '✓' : '✗'} ${health.line}`);
    if (!health.ok) process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  if (err instanceof KitError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  throw err;
});
