// A STRUCTURED answer, taken in (issues #228–#232): the step of `answerItem` (answer.ts) that
// reads the stored task, refuses the wrong shape and judges the parts. docs/architecture.md
// §Practice ("Structured items").
//
// A structured question is answered with parts and judged by code (Regel 0 of #224): the parts
// are compared with the key in `items.task`. One shape per question, and the server refuses the
// other one: a structured question takes no typed text, a question with one answer takes no
// parts. A request for help is still a request for help — its text goes the way it goes for any
// question. Only a cloze gap no rule could decide goes to the model, and only that gap.

import {
  isStructuredKind,
  type StructuredAnswer,
  type StructuredTask,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { judgeOpenGaps, type GapContext } from './cloze.js';
import { checkStructured, structuredTaskOf, type StructuredCheck } from './structured.js';

type Question = GapContext & { kind: string; task: unknown; prompt: string };

/**
 * The question's task (null for a question with one answer) and the check of her parts (null
 * when she sent none, or asked for help). Throws when the shape does not fit the question.
 */
export async function takeParts(
  deps: Deps,
  item: Question,
  input: { parts?: StructuredAnswer | null; hintRequest: boolean; learnerId: string },
): Promise<{ structured: StructuredTask | null; partsCheck: StructuredCheck | null }> {
  const structured = isStructuredKind(item.kind) ? structuredTaskOf(item.task, item.kind) : null;
  if (isStructuredKind(item.kind) && !structured) {
    // The kind says structured and the stored task no longer reads as one. Nothing can be
    // compared, so nothing is claimed; "Lösung zeigen" and "Frage passt nicht" still work.
    throw new AppError('conflict', 'This question cannot be answered', {
      reason: 'task_unreadable',
    });
  }
  if (input.hintRequest) return { structured, partsCheck: null };
  if (!input.parts) {
    if (structured) {
      throw new AppError('invalid_input', 'This question is answered with parts', {
        reason: 'use_parts',
      });
    }
    return { structured, partsCheck: null };
  }
  if (!structured) {
    throw new AppError('invalid_input', 'This question is not answered with parts', {
      reason: 'no_parts',
    });
  }
  // The word cells of a table (#230) and the gaps of a cloze (#232) follow the subject's
  // spelling rule like any answer.
  const checked = checkStructured(structured, input.parts, {
    spelling: item.spelling,
    subject_kind: item.subject_kind,
  });
  if (!checked) {
    throw new AppError('invalid_input', 'These parts do not fit this question', {
      reason: 'parts_mismatch',
    });
  }
  if (checked.type !== 'cloze' || structured.type !== 'cloze') {
    return { structured, partsCheck: checked };
  }
  const partsCheck = await judgeOpenGaps(deps, {
    task: structured,
    prompt: item.prompt,
    check: checked,
    ctx: item,
    learnerId: input.learnerId,
  });
  return { structured, partsCheck };
}
