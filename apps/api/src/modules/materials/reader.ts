// One reading of a sheet's photos with the model. docs/architecture.md §Material.

import type { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { callModel } from '../../llm/call.js';
import type { LlmPart, LlmResult } from '../../llm/gateway.js';
import { curriculumBlock } from '../curriculum/state.js';
import { ageOn } from '../identity/model.js';
import { EXTRACT_SYSTEM, HOMEWORK_SYSTEM, LEAN_RULES } from './extract.js';
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACTION_SCHEMA,
  HOMEWORK_SCHEMA,
  SOURCE_RULES,
  SOURCES_PROMPT_VERSION,
} from './sources.js';

type ReadingLearner = {
  id: string;
  locale: string;
  level: string;
  grade: number | null;
  birth_date: string;
  /**
   * The Bundesland of her school (issue #199): at twelve verified places it decides what a
   * complete answer is, so the key written from her sheet depends on it (issue #214).
   */
  curriculum_region: CurriculumRegion | null;
};

/** One reading of the photos already loaded. `extra` is what THIS reading is told on top. */
type Reader = (lean: boolean, extra: string) => Promise<LlmResult>;

/**
 * Everything a reading of a sheet needs besides its photos: the learner it is pitched at, her
 * zone, and the model call itself. One place, because every reading of a sheet is the same call
 * with one more paragraph: nothing for the first, `moreRules` for a continued one (issue #150),
 * `clarifiedRules` for one the learner has settled a spot for (issue #164).
 */
export async function sheetReader(
  deps: Deps,
  learnerId: string,
  opts: { homework: boolean; parts: LlmPart[]; now: Date },
): Promise<{ learner: ReadingLearner; timezone: string; read: Reader }> {
  const learner = await deps.db.one<ReadingLearner>(
    `select id, locale, level, grade, birth_date, curriculum_region from learners where id = $1`,
    [learnerId],
  );
  const tz = await learnerTimezone(deps.db, learnerId);
  const level =
    learner.level === 'school'
      ? `school, grade ${learner.grade ?? 'unknown'}`
      : learner.level === 'unknown'
        ? 'unknown'
        : learner.level;
  const read: Reader = (lean, extra) =>
    callModel(deps, learner.id, localParts(opts.now, tz).date, {
      purpose: 'extraction',
      tier: 'smart',
      promptVersion: `${EXTRACT_PROMPT_VERSION}${opts.homework ? '' : `+${SOURCES_PROMPT_VERSION}`}`,
      // A study reading also says what kind of page it is (issue #259); homework never does.
      system: `${opts.homework ? HOMEWORK_SYSTEM : `${EXTRACT_SYSTEM}\n\n${SOURCE_RULES}`}${
        lean ? `\n\n${LEAN_RULES}` : ''
      }${extra ? `\n\n${extra}` : ''}`,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                `LEARNER: ${ageOn(learner.birth_date, opts.now)} years, level ${level}, app language ${learner.locale}`,
                // Which curriculum decides what a complete answer is (issue #214). The sheet
                // itself is never questioned here — only the key written from it.
                curriculumBlock({ region: learner.curriculum_region, grade: learner.grade }),
              ]
                .filter(Boolean)
                .join('\n'),
            },
            ...opts.parts,
          ],
        },
      ],
      schema: opts.homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA,
      // Homework is at most 12 tasks without worked solutions: a smaller limit, so a
      // reading that runs on is cut off after seconds, not after 40 (live finding 2).
      maxOutputTokens: opts.homework ? 8_000 : 12_000,
      temperature: 0.3,
      timeoutMs: 120_000,
      // Read once in the background: time to think (see generate.ts).
      thinkingBudget: 2048,
    });
  return { learner, timezone: tz, read };
}
