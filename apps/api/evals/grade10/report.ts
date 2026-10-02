// The report of a grade-10 eval run (issue #298): numbers, every case in one row, the concrete
// weaknesses, and examples to read. Pure, so its shape is tested offline.
//
// requires live verification in Claude Code session (eval tooling; the live run needs the real model)

import type { Agreement } from './score.js';
import { flagsOf, summarize, weaknesses, type CaseResult } from './score.js';

export type RunInfo = {
  /** ISO time of the run (the app clock is not involved: this is a report header). */
  at: string;
  model: string;
  judgeModel: string;
  prompts: Record<string, string>;
  seed: string;
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const one = (x: number) => x.toFixed(1).replace('.', ',');

export function renderReport(
  info: RunInfo,
  results: readonly CaseResult[],
  agree: Agreement | null,
): string {
  const s = summarize(results);
  const out: string[] = [
    `# Klasse-10-Eval: Wie gut vermittelt Buddy? (${info.at.slice(0, 10)})`,
    '',
    `Modell ${info.model}, Richter ${info.judgeModel}, Prompts ${Object.entries(info.prompts)
      .map(([k, v]) => `${k} \`${v}\``)
      .join(', ')}, Stichproben-Seed \`${info.seed}\`.`,
    '',
    '## Zahlen',
    '',
    `${s.cases} Fälle, ${s.judged} bewertet, ${s.flagged} mit Befund.`,
    '',
  ];
  if (s.mean && s.good) {
    out.push(
      '| Kriterium | Mittel (1–5) | Anteil 4–5 |',
      '| --- | --- | --- |',
      `| Fachliche Richtigkeit | ${one(s.mean.correctness)} | ${pct(s.good.correctness)} |`,
      `| Verständlich für 15/16-Jährige | ${one(s.mean.clarity)} | ${pct(s.good.clarity)} |`,
      `| Passung zum Lehrplan Kl. 10 | ${one(s.mean.curriculum)} | ${pct(s.good.curriculum)} |`,
      `| Länge passt zur Frage | ${one(s.mean.length_fits)} | ${pct(s.good.length_fits)} |`,
      '',
      `Erklärungen mit mindestens einem vom Richter benannten Fehler: **${s.withErrors}**.`,
      '',
    );
  }
  out.push(
    `Länge (gezählt, nicht beurteilt): ${s.length.ok} im Band, ${s.length.too_long} zu lang, ${s.length.too_short} zu kurz.`,
    '',
    `Vergleich mit der Lehrkraft-Referenz, in beiden Reihenfolgen gefragt: Buddy besser ${s.pair.buddy}, Referenz besser ${s.pair.reference}, gleichauf ${s.pair.tie}, **Positionsfehler ${s.pair.position_bias}** (das Urteil kippte mit der Reihenfolge und zählt nicht).`,
    '',
    `Geführtes Vormachen: ${s.guide.asked} Pläne angefragt, ${s.guide.accepted} vom Code angenommen, ${s.guide.rejected} verworfen, ${s.guide.error} nicht erhalten.`,
    '',
    '## Je Fall',
    '',
    '| Fall | Richtig | Klar | Lehrplan | Länge | Wörter | Vergleich | Vormach-Plan | Befund |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of results) {
    const g = r.guide
      ? r.guide.status === 'accepted'
        ? `angenommen (${r.guide.lines} Zeilen${r.guide.figure ? ', Figur' : ''})`
        : r.guide.status === 'rejected'
          ? `verworfen: ${r.guide.reason}`
          : 'Fehler'
      : '–';
    const flags = flagsOf(r);
    out.push(
      `| ${r.id} | ${r.rubric?.correctness ?? '–'} | ${r.rubric?.clarity ?? '–'} | ${r.rubric?.curriculum ?? '–'} | ${r.rubric?.length_fits ?? '–'} | ${r.words} | ${r.pair ?? '–'} | ${g} | ${flags.length ? flags.join('; ') : 'ohne'} |`,
    );
  }
  const weak = weaknesses(results);
  out.push('', '## Schwächen', '', ...(weak.length ? weak.map((w) => `- ${w}`) : ['Keine.']), '');
  if (agree) {
    out.push(
      '## Mensch gegen Richter',
      '',
      `${agree.n} Erklärungen von einem Menschen bewertet.`,
      '',
      '| Kriterium | gleich | höchstens 1 auseinander | Richter großzügiger um |',
      '| --- | --- | --- | --- |',
      ...(['correctness', 'clarity', 'curriculum', 'length_fits'] as const).map(
        (f) =>
          `| ${f} | ${pct(agree.exact[f])} | ${pct(agree.withinOne[f])} | ${one(agree.bias[f])} |`,
      ),
      '',
    );
  } else {
    out.push(
      '## Mensch gegen Richter',
      '',
      'Noch nicht erhoben: die Stichprobe liegt als Bogen bei, ausgefüllt wird sie mit `GRADE10_HUMAN=<bogen.md>` eingelesen.',
      '',
    );
  }
  out.push('## Die Erklärungen', '');
  for (const r of results) {
    out.push(
      `### ${r.id} — ${r.topic}`,
      '',
      ...(r.explanation ? r.explanation.split('\n').map((l) => `> ${l}`) : ['_keine_']),
      '',
      ...(r.rubric ? [`_${r.rubric.why}_`, ''] : []),
    );
  }
  return `${out.join('\n')}\n`;
}
