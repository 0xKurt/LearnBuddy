// A tiny argv reader: --flag, --flag=value, --key value, --key=value; repeated keys collect.
// A key in `valued` always takes a value; any other key is a flag that may carry one with "=".

export type Args = { positional: string[]; flags: Set<string>; values: Map<string, string[]> };

export function parseArgs(argv: string[], valued: readonly string[]): Args {
  const out: Args = { positional: [], flags: new Set(), values: new Map() };
  const add = (key: string, value: string) =>
    out.values.set(key, [...(out.values.get(key) ?? []), value]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) {
      out.positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (!valued.includes(key)) {
      out.flags.add(key);
      if (eq > 0) add(key, a.slice(eq + 1));
      continue;
    }
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    add(key, value);
  }
  return out;
}
