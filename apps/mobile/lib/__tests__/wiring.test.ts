// Is everything connected? Read from the source, so a forgotten piece fails here
// and not in Lena's hands:
// - every call the app makes has a route on the server, and every route is used
//   by the app (or is listed below as server-only, with the reason);
// - every endpoint function is used by a screen;
// - every screen can be reached from somewhere in the app;
// - every text the app asks for exists in the German locale (the parity test
//   checks the other languages against German).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const MOBILE = join(__dirname, '../..');
const API = join(MOBILE, '../api/src');

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, 'utf8');
/** "/sessions/:id/answer" and "/sessions/${id}/answer" → "/sessions/:p/answer". */
const norm = (method: string, path: string) =>
  `${method} ${`/${path}`
    .replace(/\?.*$/, '')
    .replace(/\$\{[^}]+\}/g, ':p')
    .replace(/:[a-zA-Z]+/g, ':p')
    .replace(/\/+/g, '/')
    .replace(/(.)\/$/, '$1')}`;

// ─────────────── server routes ───────────────

const PREFIX: Record<string, string> = {};
for (const m of read(join(API, 'app.ts')).matchAll(/api\.route\('([^']*)',\s*(\w+)\)/g))
  PREFIX[m[2]!] = m[1] === '/' ? '' : m[1]!;

const serverRoutes = new Set<string>();
for (const f of files(join(API, 'modules'), /routes\.ts$/)) {
  for (const m of read(f).matchAll(/(\w+Routes)\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
    const prefix = PREFIX[m[1]!];
    if (prefix === undefined) throw new Error(`${m[1]} is not mounted in app.ts`);
    serverRoutes.add(norm(m[2]!.toUpperCase(), `${prefix}${m[3]}`));
  }
}
for (const m of read(join(API, 'app.ts')).matchAll(/api\.(get|post)\('([^']*)'/g))
  serverRoutes.add(norm(m[1]!.toUpperCase(), m[2]!));

/** Routes the app does not call, and why. */
const SERVER_ONLY: Record<string, string> = {
  'GET /health': 'monitoring',
  'POST /internal/tick': 'the scheduler (pg_cron) calls it every minute',
};

// ─────────────── app calls ───────────────

const ENDPOINTS = join(MOBILE, 'lib/api/endpoints.ts');
const appCalls = new Set<string>();
for (const f of files(join(MOBILE, 'lib'), /\.tsx?$/)) {
  for (const m of read(f).matchAll(
    /(?:request|streamRequest)\(\s*'(GET|POST|PUT|PATCH|DELETE)',\s*[`']([^`']+)[`']/g,
  ))
    appCalls.add(norm(m[1]!, m[2]!));
}

// ─────────────── the app's source ───────────────

const sources = [
  ...files(join(MOBILE, 'app'), /\.tsx?$/),
  ...files(join(MOBILE, 'components'), /\.tsx?$/),
  ...files(join(MOBILE, 'lib'), /\.tsx?$/),
];
const code = new Map(sources.map((f) => [f, read(f)]));

describe('wiring', () => {
  it('every call the app makes has a route on the server', () => {
    expect([...appCalls].filter((c) => !serverRoutes.has(c)).sort()).toEqual([]);
  });

  it('every route on the server is used by the app (or is server-only on purpose)', () => {
    const unused = [...serverRoutes].filter((r) => !appCalls.has(r) && !(r in SERVER_ONLY));
    expect(unused.sort()).toEqual([]);
    for (const r of Object.keys(SERVER_ONLY)) expect(serverRoutes.has(r), r).toBe(true);
  });

  it('every endpoint function is used by the app', () => {
    const names = [
      ...read(ENDPOINTS).matchAll(/export (?:const|async function|function) (\w+)/g),
    ].map((m) => m[1]!);
    const unused = names.filter(
      (n) => ![...code].some(([f, text]) => f !== ENDPOINTS && new RegExp(`\\b${n}\\b`).test(text)),
    );
    expect(unused).toEqual([]);
  });

  /** Screens opened from outside the app, and how. */
  const OPENED_BY_LINK: Record<string, RegExp> = {
    // The link in the "new password" e-mail (Supabase redirect).
    'reset-password': /authRedirect\('reset-password'\)/,
  };

  it('every screen can be reached', () => {
    const screens = files(join(MOBILE, 'app'), /\.tsx$/)
      .map((f) => relative(join(MOBILE, 'app'), f).replace(/\.tsx$/, ''))
      .filter((s) => !s.startsWith('_') && s !== 'index');
    const everything = [...code.values()].join('\n');
    for (const [screen, how] of Object.entries(OPENED_BY_LINK))
      expect(how.test(everything), `${screen} is opened by a link`).toBe(true);
    const unreachable = screens.filter((s) => {
      if (s in OPENED_BY_LINK) return false;
      const path = `/${s.replace(/\[[^\]]+\]/g, '')}`.replace(/\/$/, '/');
      // '/memory', "pathname: '/capture'", `/practice/${id}`, href="/settings"
      return !new RegExp(`['"\`]${path.replace(/[/]/g, '\\/')}(?:['"\`?]|\\$\\{)`).test(everything);
    });
    expect(unreachable).toEqual([]);
  });

  it('every text the app asks for exists (German)', () => {
    const dir = join(MOBILE, 'locales/de');
    const locale = new Map<string, Set<string>>();
    const flatten = (o: unknown, prefix: string, into: Set<string>) => {
      if (o && typeof o === 'object')
        for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, into);
      else into.add(prefix);
    };
    for (const f of readdirSync(dir)) {
      const keys = new Set<string>();
      flatten(JSON.parse(read(join(dir, f))), '', keys);
      locale.set(f.replace(/\.json$/, ''), keys);
    }
    const has = (ns: string, key: string) => {
      const keys = locale.get(ns);
      return (
        !!keys &&
        (keys.has(key) ||
          keys.has(`${key}_one`) ||
          keys.has(`${key}_other`) ||
          [...keys].some((k) => k.startsWith(`${key}.`)))
      );
    };
    const missing: string[] = [];
    for (const [f, text] of code) {
      // The namespaces this file loads (useTranslation('x') or (['x', 'y'])); the first is the default.
      const used = [...text.matchAll(/useTranslation\(\s*(?:'(\w+)'|\[([^\]]*)\])/g)].flatMap(
        (m) => (m[1] ? [m[1]] : [...m[2]!.matchAll(/'(\w+)'/g)].map((x) => x[1]!)),
      );
      for (const m of text.matchAll(/\bt\(\s*'([^'$`]+)'/g)) {
        const key = m[1]!;
        const [ns, k] = key.includes(':') ? key.split(':', 2) : [null, key];
        const ok = ns
          ? has(ns, k!)
          : (used.length ? used : [...locale.keys()]).some((n) => has(n, k!));
        if (!ok) missing.push(`${relative(MOBILE, f)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
