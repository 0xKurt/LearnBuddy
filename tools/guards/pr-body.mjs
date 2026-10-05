// The PR text says what CLAUDE.md asks of every PR (issues #296, #313), so a reviewer never has to
// ask for it:
//
//   · **Dient USP-Punkt:** one of the five points of docs/buddy/01-prinzip-und-diagnose.md §1.1 —
//     or „keiner“ with a reason (#296 Plan 3: without a reason the PR does not come);
//   · **Bibliotheks-Check:** the issue with the check, or „keiner“ (Engineering-Regel 1);
//   · **Wiederverwendet / entfernt:** which existing parts it reuses and what it removed
//     (Verbindliche Entwicklungsanweisung, 04.10.).
//
// The template's own hints are HTML comments; they are removed first, so an untouched template is
// red. What is written there is a review question; THAT it is written is checked here.
//
//   node tools/guards/pr-body.mjs                 reads the body from $GITHUB_EVENT_PATH (CI)
//   node tools/guards/pr-body.mjs <file>          reads it from a file (local)
//
// Dependency-free on purpose: the CI job runs it without `pnpm install`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The labelled lines, as the template writes them (.github/pull_request_template.md). */
export const FIELDS = {
  usp: 'Dient USP-Punkt:',
  library: 'Bibliotheks-Check:',
  reuse: 'Wiederverwendet / entfernt:',
};

/** What stands after `**<label>**` on its line, the template's hints removed. */
function field(/** @type {string} */ body, /** @type {string} */ label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const match = new RegExp(`\\*\\*${escaped}\\*\\*([^\\n]*)`).exec(body);
  return match === null ? null : (match[1] ?? '').trim();
}

/** A „keiner“ needs this much reason after it. */
const MIN_REASON = 15;

/**
 * What the PR text is missing — empty when it says everything.
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function prBodyProblems(raw) {
  const body = (raw ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  /** @type {string[]} */
  const out = [];

  const usp = field(body, FIELDS.usp);
  if (usp === null)
    out.push(`Zeile „**${FIELDS.usp}**“ fehlt (Vorlage: .github/pull_request_template.md)`);
  else {
    const none = /^kein(?:er|em|e)?\b[\s:—–-]*(.*)$/i.exec(usp);
    if (none !== null) {
      if ((none[1] ?? '').trim().length < MIN_REASON)
        out.push(`„${FIELDS.usp} keiner“ braucht eine Begründung — sonst entfällt der PR (#296)`);
    } else if (!/(^|[^\d])[1-5]([^\d]|$)/.test(usp))
      out.push(
        `${FIELDS.usp} nennt keinen der Punkte 1–5 (docs/buddy/01-prinzip-und-diagnose.md §1.1)`,
      );
  }

  for (const key of /** @type {const} */ (['library', 'reuse'])) {
    const value = field(body, FIELDS[key]);
    if (value === null)
      out.push(`Zeile „**${FIELDS[key]}**“ fehlt (Vorlage: .github/pull_request_template.md)`);
    else if (value.replace(/[\s.\-–—:]/g, '').length === 0)
      out.push(`„${FIELDS[key]}“ ist leer — ausfüllen, notfalls mit „keiner“`);
  }
  return out;
}

function main() {
  const file = process.argv[2];
  let body;
  if (file !== undefined) body = readFileSync(file, 'utf8');
  else {
    const event = process.env.GITHUB_EVENT_PATH;
    if (event === undefined) {
      console.error('usage: node tools/guards/pr-body.mjs [<file>]  (in CI: $GITHUB_EVENT_PATH)');
      process.exit(2);
    }
    body = JSON.parse(readFileSync(event, 'utf8')).pull_request?.body ?? '';
  }
  const problems = prBodyProblems(body);
  if (problems.length === 0) {
    console.log('✓ PR-Text: USP-Punkt, Bibliotheks-Check, Wiederverwendet / entfernt');
    return;
  }
  console.error(`✗ PR-Text unvollständig (CLAUDE.md Regel 16, Engineering-Regel 1, #296):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('  Den PR-Text bearbeiten genügt: der Wächter läuft beim Speichern erneut.');
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
