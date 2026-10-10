// What each STATE section costs over a whole eval run, and how often an answer pointed back
// at it (issue #168). Switched on with BUDDY_BLOCK_AUDIT=<file> on evals/buddy/run.ts; off,
// not a line of this runs and not a byte of the request changes (src/modules/buddy/blocks.ts,
// proved in src/__tests__/block-audit.int.test.ts).
//
// Two numbers per section, and they answer different questions:
//   cost      — characters it added to every model call it was part of. Measured, exact.
//   reference — answers that repeated something only this section offered (an alias, a title,
//               a topic, her name). Evidence that it reached an answer; NOT evidence that it
//               was needed, and zero is not evidence that it is dead. A section can decide an
//               answer without leaving a word in it.
// Sections whose content cannot be quoted (the clock, the voice, the contact rules) are
// marked "—" instead of 0: for them the only signal is a tool whose arguments could come
// from nowhere else, and that is reported separately.
// requires live verification in Claude Code session (its input is a live eval run)

import {
  blockNames,
  quotable,
  referencedBlocks,
  type BlockName,
} from '../../src/modules/buddy/blocks.js';
import type { StateSample } from '../../src/modules/buddy/blocks.js';

/**
 * A tool call whose arguments can only have been chosen from one section. The day offsets
 * ("+3 Thu 2026-10-01") stand in `## Now` and nowhere else; set_voice and set_contact answer
 * what `## Your voice` and `## Contact outside the app` say. Weaker than a quoted datum —
 * the model could in principle guess an offset — so it is counted apart from the references.
 */
const TOOL_SIGNAL: Array<{ block: BlockName; needle: string; what: string }> = [
  { block: 'now', needle: '"kind":"in_days"', what: 'a day written as an in_days offset' },
  { block: 'voice', needle: '"tool":"set_voice"', what: 'set_voice' },
  { block: 'contact', needle: '"tool":"set_contact"', what: 'set_contact' },
];

type Totals = {
  /** Model calls (contexts built) this section was part of. */
  contexts: number;
  /** Characters it contributed, summed over those contexts. */
  chars: number;
  /** Cases in which it was part of at least one context. */
  cases: number;
  /**
   * Cases in which it held rows of hers, not only its heading and "- nothing yet". The
   * honest denominator for `referenced`: an empty section cannot be referenced, so counting
   * those cases against it would make it look ignored when it had nothing to offer.
   */
  withData: number;
  /** Cases in which an answer repeated something only this section offered. */
  referenced: number;
  /** Cases in which a tool argument could only have come from this section. */
  toolSignal: number;
  /** The strings that were repeated, for reading the table against reality. */
  evidence: string[];
};

export class BlockAudit {
  private readonly totals = new Map<BlockName, Totals>();
  private pending: StateSample[] = [];
  private contexts = 0;
  private cases = 0;
  /** Model calls that carried one of those contexts (a lookup round sends the same STATE again). */
  private calls = 0;
  /** Strings two sections both offered, so neither was credited. */
  private readonly shared = new Set<string>();

  readonly record = (sample: StateSample): void => {
    this.pending.push(sample);
  };

  private totalsOf(name: BlockName): Totals {
    let t = this.totals.get(name);
    if (!t) {
      t = {
        contexts: 0,
        chars: 0,
        cases: 0,
        withData: 0,
        referenced: 0,
        toolSignal: 0,
        evidence: [],
      };
      this.totals.set(name, t);
    }
    return t;
  }

  /**
   * One case is over: `output` is every JSON object the model wrote in it (the `output`
   * column of its decisions — reply, actions with their arguments, lookup calls).
   */
  closeCase(output: string, turnCalls: number): void {
    this.calls += turnCalls;
    const seen = new Set<BlockName>();
    const hadData = new Set<BlockName>();
    const referenced = new Set<BlockName>();
    for (const sample of this.pending) {
      this.contexts++;
      for (const b of sample.blocks) {
        const t = this.totalsOf(b.name);
        t.contexts++;
        t.chars += b.chars;
        seen.add(b.name);
        if (b.data.length > 0) hadData.add(b.name);
      }
      const hits = referencedBlocks(sample.blocks, output);
      for (const s of hits.shared) this.shared.add(s);
      for (const [name, data] of Object.entries(hits.byBlock)) {
        referenced.add(name as BlockName);
        const t = this.totalsOf(name as BlockName);
        for (const d of data) if (!t.evidence.includes(d)) t.evidence.push(d);
      }
    }
    for (const name of seen) this.totalsOf(name).cases++;
    for (const name of hadData) this.totalsOf(name).withData++;
    for (const name of referenced) this.totalsOf(name).referenced++;
    for (const sig of TOOL_SIGNAL) {
      if (seen.has(sig.block) && output.includes(sig.needle)) this.totalsOf(sig.block).toolSignal++;
    }
    this.cases++;
    this.pending = [];
  }

  json(): unknown {
    return {
      cases: this.cases,
      contexts: this.contexts,
      calls: this.calls,
      blocks: blockNames()
        .filter((n) => this.totals.has(n))
        .map((n) => {
          const t = this.totalsOf(n);
          return {
            block: n,
            quotable: quotable(n),
            contexts: t.contexts,
            chars: t.chars,
            charsPerContext: Math.round(t.chars / Math.max(t.contexts, 1)),
            cases: t.cases,
            casesWithData: t.withData,
            referencedCases: quotable(n) ? t.referenced : null,
            toolSignalCases: TOOL_SIGNAL.some((s) => s.block === n) ? t.toolSignal : null,
            evidence: t.evidence.slice(0, 12),
          };
        }),
      sharedData: [...this.shared],
    };
  }

  /** The table for the report: cost against references, per section. */
  table(): string {
    const chars = [...this.totals.values()].reduce((n, t) => n + t.chars, 0);
    const head =
      'section      contexts   chars  per ctx   % STATE  cases  with data  referenced  tool\n' +
      '-------------------------------------------------------------------------------------';
    const rows = blockNames()
      .filter((n) => this.totals.has(n))
      .map((n) => {
        const t = this.totalsOf(n);
        const per = Math.round(t.chars / Math.max(t.contexts, 1));
        const ref = quotable(n) ? `${t.referenced}/${t.withData}` : '—';
        const tool = TOOL_SIGNAL.some((s) => s.block === n) ? `${t.toolSignal}/${t.cases}` : '—';
        return (
          `${n.padEnd(12)} ${String(t.contexts).padStart(8)} ${String(t.chars).padStart(7)}` +
          ` ${String(per).padStart(8)} ${((100 * t.chars) / Math.max(chars, 1)).toFixed(1).padStart(9)}` +
          ` ${String(t.cases).padStart(6)} ${String(t.withData).padStart(10)}` +
          ` ${ref.padStart(11)} ${tool.padStart(6)}`
        );
      });
    return [
      `${this.cases} cases, ${this.contexts} model contexts in ${this.calls} model calls` +
        ` (a lookup round sends the same STATE again), ${chars} characters of STATE in total`,
      head,
      ...rows,
      '',
      'referenced = cases whose answer repeated a string only that section offered, out of the' +
        ' cases where it had anything to offer (with data).',
      `tool signal = ${TOOL_SIGNAL.map((s) => `${s.block}: ${s.what}`).join(' · ')}.`,
      'A section can shape an answer without leaving a word in it: zero is a question, not a verdict.',
      this.shared.size > 0
        ? `strings two sections both offered (credited to neither): ${[...this.shared].slice(0, 20).join(' · ')}`
        : 'no string was offered by two sections at once.',
    ].join('\n');
  }
}
