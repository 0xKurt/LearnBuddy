// One rule book per model purpose for the browser walkthrough: an answer is chosen by **what
// the request says** — never by the order the specs happen to run in (issues #81, #350).
//
// A queued answer (`ScriptedGateway.script`) goes to whichever spec asks first. Run alone, a
// spec then took an answer another spec had queued: modes.spec.ts's homework step consumed the
// core loop's tutor reply and failed (#350); charts.spec.ts took the core loop's check (#303).
// Every scenario therefore adds rules here or to turns.ts, and the walkthrough's gateway holds
// no queue at all — `walkthrough.test.ts` fails the moment one comes back.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { LlmError, type LlmPurpose, type LlmRequest } from '../../llm/gateway.js';
import { ScriptedGateway } from '../fakes.js';

export type Rule = {
  /** What the request must contain (matched over `ScriptedGateway.textOf`). */
  when: RegExp;
  /** Only for requests whose system prompt matches as well (a homework reading, say). */
  system?: RegExp;
  /** The answer; a function sees the whole request. */
  answer: (req: LlmRequest) => unknown;
};

/** What a request no rule is about gets. */
type Miss = (req: LlmRequest, text: string) => unknown;

/** The same answer as a purpose nobody scripted (`ScriptedGateway.generate`). */
const unscripted: Miss = (req) => {
  throw new LlmError('unavailable', `unscripted model call (${req.purpose})`);
};

export class RuleBook {
  private readonly rules: Rule[] = [];

  constructor(
    private readonly purpose: LlmPurpose,
    private miss: Miss = unscripted,
  ) {}

  /** What every request no rule is about gets (instead of an unscripted call). */
  otherwise(answer: Miss): void {
    this.miss = answer;
  }

  /** Scenarios add their rules; the order only decides which of two matching rules wins. */
  add(...added: Rule[]): void {
    this.rules.push(...added);
  }

  /** Installs the dispatcher; call it once, after every scenario has added its rules. */
  install(llm: ScriptedGateway): void {
    llm.byDefault(this.purpose, (req: LlmRequest) => {
      const text = ScriptedGateway.textOf(req);
      const rule = this.rules.find(
        (r) => r.when.test(text) && (r.system === undefined || r.system.test(req.system)),
      );
      return rule ? rule.answer(req) : this.miss(req, text);
    });
  }
}

/**
 * Answers that follow each other for the SAME request — a sheet unreadable at first and read
 * when she asks again. Round and round, so a spec run twice on one stack starts over at the
 * first. Only for a rule no other spec's request matches.
 */
export function inTurn(...answers: unknown[]): () => unknown {
  let next = 0;
  return () => {
    const answer = answers[next % answers.length];
    next += 1;
    return answer;
  };
}

/** Prepared hints and judgements in practice (practice/service.ts). */
export const tutorRules = new RuleBook('tutor');
/**
 * The ladder written in the background after a run starts (practice/hints.ts): hints, the worked
 * solution and the reasons of „Warum stimmt das?" (#388). A question no rule is about gets none.
 */
export const hintRules = new RuleBook('hints', () => ({ items: [] }));
/** Reading a photographed sheet or homework (materials/service.ts). */
export const readingRules = new RuleBook('extraction');
/** Judging a spoken sentence (practice/speak.ts). */
export const pronounceRules = new RuleBook('pronounce');
