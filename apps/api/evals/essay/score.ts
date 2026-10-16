// What the essay eval measures and writes down (issue #258) — pure, so `__tests__/score.test.ts`
// proves it without a model. `run.ts` sends each case of `cases.ts` through the real API and hands
// the feedback here.
//
// Agreement is counted per key point: Buddy's state ("met"/"open") against the set's expectation.
// The two ways to disagree are kept apart, because they are not equally bad:
//   · falseMet  — Buddy says a point is there that is not: praise for what she did not do;
//   · missedMet — Buddy says a point is open that she did: she is sent to fix what holds.
// The report is written for a teacher: her text, the expectation, Buddy's state and the quote it
// found, Buddy's three places — and an empty column for the teacher's own judgement. Only that
// column documents agreement with a teacher; the expectation is the set author's.
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import {
  ESSAY_TEXT_MAX,
  lineNumbers,
  type EssayFeedback,
  type EssayType,
  type ReadPassage,
} from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../src/i18n/index.js';
import { ESSAY_POINTS } from '../../src/modules/practice/essay.js';
import type { EssayCase, Expect } from './cases.js';

/** What the eval asks of the set: at least this many texts per text type (the Abnahme). */
export const PER_TYPE_MIN = 20;

/** Buddy's state of a point; `none`: no feedback came at all (outage, help answer). */
export type Got = 'met' | 'open' | 'unknown' | 'none';

export type CaseResult = {
  case: EssayCase;
  /** The feedback the API gave; null when it gave none. */
  feedback: EssayFeedback | null;
  /** The reply was the fixed help answer (#389): no topic here is distress. */
  safeguarded: boolean;
  /** Why there was no feedback, when there was none. */
  error: string | null;
};

export type PointRow = {
  point: string;
  name: string;
  expected: Expect;
  got: Got;
  quote: string | null;
  agree: boolean;
};

const pointName = (id: string) => t('de', `practice.essay.point.${id}.name` as MessageKey);

/** Each key point of the case: the expectation beside Buddy's state, in the type's order. */
export function pointsOf(r: CaseResult): PointRow[] {
  return ESSAY_POINTS[r.case.type].map((id, i) => {
    const view = r.feedback?.points[i];
    const got: Got = view ? view.state : 'none';
    const expected = r.case.expected[id] ?? 'open';
    return {
      point: id,
      name: pointName(id),
      expected,
      got,
      quote: view?.quote ?? null,
      agree: got === expected,
    };
  });
}

export type Tally = { agree: number; total: number; falseMet: number; missedMet: number };
const empty = (): Tally => ({ agree: 0, total: 0, falseMet: 0, missedMet: 0 });

function add(t: Tally, row: PointRow): void {
  t.total += 1;
  if (row.agree) t.agree += 1;
  else if (row.got === 'met') t.falseMet += 1;
  else if (row.expected === 'met') t.missedMet += 1;
}

export type Summary = {
  all: Tally;
  byType: Partial<Record<EssayType, Tally>>;
  /** Keyed `type/point`. */
  byPoint: Record<string, Tally>;
  /** Cases without feedback (outage, broken output) — counted as disagreement on every point. */
  noFeedback: number;
  /** Cases that got the help answer: none of these texts tells of danger. */
  safeguarded: number;
};

export function summarize(results: readonly CaseResult[]): Summary {
  const s: Summary = { all: empty(), byType: {}, byPoint: {}, noFeedback: 0, safeguarded: 0 };
  for (const r of results) {
    if (r.feedback === null) s.noFeedback += 1;
    if (r.safeguarded) s.safeguarded += 1;
    const type = (s.byType[r.case.type] ??= empty());
    for (const row of pointsOf(r)) {
      add(s.all, row);
      add(type, row);
      add((s.byPoint[`${r.case.type}/${row.point}`] ??= empty()), row);
    }
  }
  return s;
}

const pct = (t: Tally) => (t.total === 0 ? '–' : `${Math.round((100 * t.agree) / t.total)} %`);
const STATE: Record<Got | Expect, string> = {
  met: '✓ erfüllt',
  open: '○ offen',
  unknown: '? kein Urteil',
  none: '– keine Rückmeldung',
};
const TYPE_NAME: Record<EssayType, string> = {
  argue_linear: 'Stellungnahme (argue_linear)',
  argue_dialectic: 'Erörterung (argue_dialectic)',
  analyse: 'Textanalyse (analyse)',
};
const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');

function passageBlock(p: ReadPassage): string[] {
  const n = lineNumbers(p.lines);
  return [
    `**${p.title ?? 'Text'}**`,
    '',
    '```',
    ...p.lines.map((l, i) => `${String(n[i] ?? '').padStart(2)}  ${l}`),
    '```',
    '',
  ];
}

/** The report a teacher can check, case by case, with the summary on top. */
export function report(results: readonly CaseResult[], meta: { title: string }): string {
  const s = summarize(results);
  const out: string[] = [
    `# ${meta.title}`,
    '',
    'Für die Lehrkraft: Je Text stehen die Erwartung des Sets und Buddys Urteil nebeneinander. Bitte in der letzten Spalte eintragen, ob Buddys Urteil zutrifft (✓) oder nicht (✗). Erst diese Spalte belegt die Übereinstimmung mit einer Lehrkraft.',
    '',
    '## Übereinstimmung mit der Erwartung des Sets',
    '',
    '| | Übereinstimmung | fälschlich erfüllt | fälschlich offen |',
    '|---|---|---|---|',
    `| alle Kernpunkte | ${pct(s.all)} (${s.all.agree}/${s.all.total}) | ${s.all.falseMet} | ${s.all.missedMet} |`,
    ...(Object.entries(s.byType) as Array<[EssayType, Tally]>).map(
      ([type, v]) =>
        `| ${TYPE_NAME[type]} | ${pct(v)} (${v.agree}/${v.total}) | ${v.falseMet} | ${v.missedMet} |`,
    ),
    ...Object.entries(s.byPoint).map(
      ([key, v]) =>
        `| ${key.split('/')[0]} · ${pointName(key.split('/')[1] ?? '')} | ${pct(v)} (${v.agree}/${v.total}) | ${v.falseMet} | ${v.missedMet} |`,
    ),
    '',
    `Ohne Rückmeldung: ${s.noFeedback} · feste Hilfe-Antwort (sollte 0 sein): ${s.safeguarded}`,
    '',
  ];
  const shown = new Set<string>();
  for (const r of results) {
    const c = r.case;
    out.push(`## ${c.id} — ${TYPE_NAME[c.type]}`, '', `*Aufgabe:* ${c.prompt}`, '');
    if (c.passage) {
      const key = c.passage.title ?? c.id;
      if (!shown.has(key)) {
        shown.add(key);
        out.push(...passageBlock(c.passage));
      } else out.push(`*Text:* „${key}“ (siehe oben)`, '');
    }
    out.push(...c.text.split('\n').map((p) => `> ${p}\n>`), '');
    if (r.safeguarded)
      out.push('**Buddy gab die feste Hilfe-Antwort statt einer Rückmeldung.**', '');
    if (r.feedback === null && !r.safeguarded)
      out.push(`**Keine Rückmeldung**${r.error ? `: ${r.error}` : ''}`, '');
    out.push(
      '| Kernpunkt | Erwartung | Buddy | Buddys Beleg | Lehrkraft ✓/✗ |',
      '|---|---|---|---|---|',
      ...pointsOf(r).map(
        (row) =>
          `| ${row.name} | ${STATE[row.expected]} | ${STATE[row.got]}${row.agree ? '' : ' ≠'} | ${row.quote ? `„${cell(row.quote)}“` : ''} | |`,
      ),
      '',
    );
    if (r.feedback?.places.length) {
      out.push('Buddys Stellen zum Verbessern:', '');
      for (const p of r.feedback.places) out.push(`- „${p.quote}“ → ${p.better}`);
      out.push('');
    }
  }
  return `${out.join('\n')}\n`;
}

/** What is wrong with the set itself; empty when it holds what the Abnahme asks. */
export function setProblems(cases: readonly EssayCase[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) problems.push(`${c.id}: id twice`);
    ids.add(c.id);
    const want = [...ESSAY_POINTS[c.type]].sort().join(',');
    if (Object.keys(c.expected).sort().join(',') !== want)
      problems.push(`${c.id}: expects ${Object.keys(c.expected).join(',')}, the type has ${want}`);
    if (c.text.length > ESSAY_TEXT_MAX) problems.push(`${c.id}: longer than an essay may be`);
    if ((c.type === 'analyse') !== (c.passage !== null))
      problems.push(`${c.id}: an analysis needs its text, nothing else has one`);
  }
  for (const type of Object.keys(ESSAY_POINTS) as EssayType[]) {
    const of = cases.filter((c) => c.type === type);
    if (of.length < PER_TYPE_MIN)
      problems.push(`${type}: ${of.length} texts, needs ${PER_TYPE_MIN}`);
    for (const point of ESSAY_POINTS[type]) {
      const states = new Set(of.map((c) => c.expected[point]));
      if (!states.has('met') || !states.has('open'))
        problems.push(`${type}/${point}: never ${states.has('met') ? 'open' : 'met'} in the set`);
    }
    if (new Set(of.map((c) => c.text)).size !== of.length) problems.push(`${type}: a text twice`);
  }
  return problems;
}
