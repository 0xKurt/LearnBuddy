// The act-tool registry (ADR 0005 §Tools, stage 2): every tool that changes
// something is registered once — its call schema (decision.ts), the surfaces
// allowed to call it, the data it touches, whether it can be undone, and its
// handler (tools.ts). The schemas the model answers with, and the tool
// catalogue in the prompt, are generated from this registry, so a new
// capability is one entry plus its handler and tests.
//
// Surfaces are policy, enforced by the schema itself: a background check can
// only offer the tools registered for 'check' — never one that changes what
// the learner said (memory, goals, agreed reminders, settings).

import { z } from 'zod';

import { ACT_SCHEMAS, Outreach, type ActionOf, type AnyAction, type ToolName } from './decision.js';
import type { Surface } from './lookups.js';
import { ACT_HANDLERS, ToolRejection, type ToolContext, type ToolOutcome } from './tools.js';

/** What an act tool changes (for the catalogue, the audit and privacy review). */
export type Touches =
  | 'memory'
  | 'profile'
  | 'goals'
  | 'steps'
  | 'practice'
  | 'settings'
  | 'checks'
  | 'nothing';

type ActSpec<K extends ToolName> = {
  surfaces: readonly Surface[];
  touches: readonly Touches[];
  /** The learner's own words must justify it (quote checked in code). */
  needsQuote: boolean;
  undoable: boolean;
  /** One line for the catalogue: what it does. */
  does: string;
  run: (action: ActionOf<K>, ctx: ToolContext) => Promise<ToolOutcome>;
};

const TURN: readonly Surface[] = ['turn'];
const BOTH: readonly Surface[] = ['turn', 'check'];

export const ACT_TOOLS: { [K in ToolName]: ActSpec<K> } = {
  remember: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'keep something lasting or temporary about the learner',
    run: ACT_HANDLERS.remember,
  },
  correct_memory: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'correct something you know (mN)',
    run: ACT_HANDLERS.correct_memory,
  },
  forget: {
    surfaces: TURN,
    touches: ['memory'],
    needsQuote: true,
    undoable: true,
    does: 'forget something you know (mN)',
    run: ACT_HANDLERS.forget,
  },
  set_level: {
    surfaces: TURN,
    touches: ['profile'],
    needsQuote: true,
    undoable: true,
    does: 'set school grade / university / adult',
    run: ACT_HANDLERS.set_level,
  },
  plan_exam: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'plan a test with its day',
    run: ACT_HANDLERS.plan_exam,
  },
  update_goal: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: "change a test's day or title (gN)",
    run: ACT_HANDLERS.update_goal,
  },
  close_goal: {
    surfaces: TURN,
    touches: ['goals'],
    needsQuote: true,
    undoable: true,
    does: 'close a test as done (with outcome) or drop it (gN)',
    run: ACT_HANDLERS.close_goal,
  },
  prepare_practice: {
    surfaces: BOTH,
    touches: ['practice', 'steps'],
    needsQuote: false,
    undoable: true,
    does: 'prepare practice from her questions, for a test or topic',
    run: ACT_HANDLERS.prepare_practice,
  },
  plan_step: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'plan a step, e.g. an agreed reminder at a time',
    run: ACT_HANDLERS.plan_step,
  },
  update_step: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'move, skip or cancel a step (stN)',
    run: ACT_HANDLERS.update_step,
  },
  mark_step_done: {
    surfaces: TURN,
    touches: ['steps'],
    needsQuote: true,
    undoable: true,
    does: 'mark a step done (stN)',
    run: ACT_HANDLERS.mark_step_done,
  },
  request_material: {
    surfaces: BOTH,
    touches: ['steps'],
    needsQuote: false,
    undoable: true,
    does: 'ask for a photo of a worksheet',
    run: ACT_HANDLERS.request_material,
  },
  set_contact: {
    surfaces: TURN,
    touches: ['settings'],
    needsQuote: true,
    undoable: true,
    does: 'reduce, pause or shift contact outside the app (never more)',
    run: ACT_HANDLERS.set_contact,
  },
  schedule_check: {
    surfaces: BOTH,
    touches: ['checks'],
    needsQuote: false,
    undoable: true,
    does: 'look again later (1 hour – 21 days)',
    run: ACT_HANDLERS.schedule_check,
  },
  offer_learning: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'offer a button that starts learning now (explain, practice, test, vocab, speak, help)',
    run: ACT_HANDLERS.offer_learning,
  },
  open_area: {
    surfaces: TURN,
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    does: 'show a button that opens a part of the app she asks for (her sheets, what you know, settings, earlier messages, the camera)',
    run: ACT_HANDLERS.open_area,
  },
};

const NAMES = Object.keys(ACT_SCHEMAS) as ToolName[];

/** Tool names a surface may call, in registry order. */
export function toolsFor(surface: Surface): ToolName[] {
  return NAMES.filter((n) => ACT_TOOLS[n].surfaces.includes(surface));
}

type KeysFor<S extends Surface> = {
  [K in ToolName]: S extends (typeof ACT_TOOLS)[K]['surfaces'][number] ? K : never;
}[ToolName];
// Surfaces are declared as readonly Surface[] (not literal tuples), so the static
// types stay the full union; the runtime schema below is what limits a surface.
export type TurnAction = ActionOf<KeysFor<'turn'>>;
export type CheckAction = ActionOf<'prepare_practice' | 'request_material' | 'schedule_check'>;

type Option = (typeof ACT_SCHEMAS)[ToolName];

function unionFor(surface: Surface) {
  const options = toolsFor(surface).map((n): Option => ACT_SCHEMAS[n]);
  const [first, second, ...rest] = options;
  if (!first || !second) throw new Error(`surface ${surface} needs at least two act tools`);
  return z.discriminatedUnion('tool', [first, second, ...rest]);
}

export const TurnActionSchema = unionFor('turn');
export const CheckActionSchema = unionFor('check');

export const TurnDecision = z.object({
  reply: z
    .string()
    .trim()
    .min(1)
    .max(700)
    .describe(
      "Your answer to the learner, in their language. Never claim a change you don't make in actions.",
    ),
  options: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(4)
    .nullable()
    .describe('Short tappable answers if you asked a question, else null'),
  actions: z.array(TurnActionSchema).max(6),
  // Lenient when parsing (older scripted answers have no such field); the model must write it.
  asks_permission: z.boolean().default(false),
});
export type TurnDecision = {
  reply: string;
  options: string[] | null;
  actions: TurnAction[];
  asks_permission: boolean;
};

/** What the model answers with: asks_permission is required there. */
export const TurnDecisionForModel = TurnDecision.extend({
  asks_permission: z
    .boolean()
    .describe(
      'true if your reply asks the learner whether you should do something ("Soll ich …?"). Then that thing must not be in actions — it happens in a later answer, after they said yes.',
    ),
});

/** Actions that remove something she had (a test, something you knew, a planned step). */
export function removesSomething(a: AnyAction): boolean {
  switch (a.tool) {
    case 'close_goal':
      return a.args.status === 'dropped';
    case 'forget':
      return true;
    case 'update_step':
      return a.args.state !== null;
    default:
      return false;
  }
}

/**
 * Code-enforced (not only prompted): a reply that asks for permission may not
 * already remove something in the same answer. Returns the reasons to repair.
 */
export function askedButActed(d: {
  asks_permission: boolean;
  actions: readonly AnyAction[];
}): string[] {
  if (!d.asks_permission) return [];
  return d.actions
    .filter(removesSomething)
    .map(
      (a) =>
        `${a.tool}: your reply asks whether to do it, but you already did it. Ask only — leave it out of actions until the learner says yes.`,
    );
}

export const CheckDecision = z.object({
  disposition: z.enum(['act', 'wait']),
  reason: z.string().trim().min(1).max(300).describe('Short audit note (not shown to the learner)'),
  actions: z.array(CheckActionSchema).max(3),
  outreach: Outreach.nullable(),
});

/** The catalogue of act tools for the prompt, generated from the registry. */
export function actToolsPrompt(surface: Surface): string {
  const lines = toolsFor(surface).map((n) => {
    const t = ACT_TOOLS[n];
    const notes = [
      t.needsQuote ? 'needs the learner’s quote' : null,
      t.undoable ? 'undoable' : null,
      t.touches.includes('nothing') ? 'changes nothing' : null,
    ].filter(Boolean);
    return `- ${n}: ${t.does}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  });
  return `ACT TOOLS you can call in "actions" here:\n${lines.join('\n')}`;
}

/**
 * Runs one act tool through the registry. The surface is checked again here
 * (the schema already limits it): a check can never run a turn-only tool.
 */
export async function runAct(action: AnyAction, ctx: ToolContext): Promise<ToolOutcome> {
  const spec = ACT_TOOLS[action.tool];
  if (!spec.surfaces.includes(ctx.mode)) {
    throw new ToolRejection(`${action.tool} is not available in a ${ctx.mode}`);
  }
  const run = spec.run as (a: AnyAction, c: ToolContext) => Promise<ToolOutcome>;
  return run(action, ctx);
}
