// Domain tables in generic SQL (issue #107 §6, owner 10.10.: "Engine darf keine Domain-Tabelle per
// SQL nennen — ein Test, nicht nur Lint"). The import guard (boundaries.mjs) sees a generic file
// that imports the learning domain; it cannot see one that reads the domain's tables itself. This
// one does: every SQL text in generic API code — a string or template literal that reads like a
// statement — that names one of the domain's tables (boundaries.config.mjs: DOMAIN_TABLES) after
// from, join, into, update or table.
//
// What may stay is what main has, measured on main's files (base.mjs, issue #452): the number of
// such statements per file. More in a file, or a new file with any, is red; the domain reads its
// own tables and hands the core what it needs through what it registers (its context provider,
// its privacy tables). A count that went down is the new measure once merged.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { textAllowance } from './base.mjs';
import { DOMAIN_TABLES, isGeneric } from './boundaries.config.mjs';
import { REPO_ROOT, sourceFiles } from './measure.mjs';

/** Where the guard looks: the API's production code (the app has no SQL). */
const DIRS = ['apps/api/src'];

/** A literal that reads like a statement, not like prose. */
const STATEMENT = /\b(select|insert|update|delete|with)\b/i;

const TABLE = new RegExp(
  `\\b(?:from|join|into|update|table)\\s+(?:only\\s+)?(?:public\\.)?(${DOMAIN_TABLES.join('|')})\\b`,
  'gi',
);

/**
 * The texts of every string and template literal in a TypeScript file; a template's
 * substitutions become a neutral placeholder (a table name never comes from one).
 * @param {string} text @param {string} file @returns {string[]}
 */
function literals(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  /** @type {string[]} */
  const out = [];
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      out.push([node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ${} '));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/**
 * The domain tables one file names in SQL, one entry per mention.
 * @param {string} text @param {string} file @returns {string[]}
 */
export function domainTablesIn(text, file) {
  return literals(text, file)
    .filter((l) => STATEMENT.test(l))
    .flatMap((l) => [...l.matchAll(TABLE)].map((m) => /** @type {string} */ (m[1]).toLowerCase()));
}

/**
 * How many SQL mentions of a domain table each generic file has (files without any are left out).
 * @param {Map<string, string>} files repository path → text @returns {Record<string, number>}
 */
export function findDomainSql(files) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [file, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!/\.tsx?$/.test(file) || !isGeneric(file)) continue;
    const n = domainTablesIn(text, file).length;
    if (n > 0) out[file] = n;
  }
  return out;
}

/** This checkout's files under DIRS. @returns {Map<string, string>} */
function filesNow() {
  return new Map(
    DIRS.flatMap(sourceFiles).map((f) => [f, readFileSync(join(REPO_ROOT, f), 'utf8')]),
  );
}

/**
 * The guard: returns the problems, empty when green.
 * @param {Record<string, number>} allowed what main has per file (base.mjs)
 * @param {Map<string, string>} [files] the files to look at (the tests pass their own)
 */
export function checkDomainSql(allowed, files = filesNow()) {
  const now = findDomainSql(files);
  const problems = Object.entries(now)
    .filter(([file, n]) => n > (allowed[file] ?? 0))
    .map(([file, n]) => {
      const tables = [...new Set(domainTablesIn(/** @type {string} */ (files.get(file)), file))];
      return (
        `NEU Domain-Tabelle per SQL im Kern: ${file} — ${n} statt ${allowed[file] ?? 0} (${tables.join(', ')})\n` +
        '  Die Domain liest ihre Tabellen selbst und gibt dem Kern, was er braucht, über das, was sie anmeldet (Kontext-Provider, Datenschutz-Tabellen).'
      );
    });
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  return { problems, summary: `${total} Abfragen in ${Object.keys(now).length} Dateien` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, summary } = checkDomainSql(textAllowance('domainSql', DIRS, findDomainSql));
  if (problems.length > 0) {
    console.error(`✗ Domain-Tabellen im Kern-SQL: ${summary}\n\n${problems.join('\n\n')}`);
    process.exit(1);
  }
  console.log(`✓ Domain-Tabellen im Kern-SQL: ${summary} — nicht mehr als auf main`);
}
