// One reading of a sheet's photos with the model. docs/architecture.md §Material.

import type { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { callModel } from '../../llm/call.js';
import type { LlmMessage, LlmPart, LlmResult } from '../../llm/gateway.js';
import { curriculumBlock } from '../curriculum/state.js';
import { availableLine, chooseForms, keptAndLost } from '../practice/formChoice.js';
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

/**
 * One reading of the photos already loaded. `extra` is what THIS reading is told on top.
 * `lost` counts the tasks it wrote that were taken out because their figure or form was not
 * chosen; `fallback` says the forms could not be chosen at all, so the reading had plain
 * questions only (#664). Either way the reading may lack what the sheet holds.
 */
type Reader = (
  lean: boolean,
  extra: string,
) => Promise<LlmResult & { lost: number; fallback: boolean }>;

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
  const day = localParts(opts.now, tz).date;
  const system = opts.homework ? HOMEWORK_SYSTEM : `${EXTRACT_SYSTEM}\n\n${SOURCE_RULES}`;
  const version = `${EXTRACT_PROMPT_VERSION}${opts.homework ? '' : `+${SOURCES_PROMPT_VERSION}`}`;
  const contents: LlmMessage[] = [
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
  ];
  // The forms and figures this sheet needs, chosen once for every reading of it: the whole
  // schema is past what Vertex serves (#627, `practice/formChoice.ts`).
  let narrowed: ReturnType<typeof chooseForms> | null = null;
  const read: Reader = async (lean, extra) => {
    narrowed ??= chooseForms(deps, learner.id, day, {
      purpose: 'extraction',
      promptVersion: version,
      system,
      contents,
      full: opts.homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA,
    });
    const chosen = await narrowed;
    const { schema, keep } = chosen;
    const line = availableLine(chosen);
    // The first reading uses the allowance held before the choice (#665); the readings after it
    // (the rest of a long sheet, a lean retry) take their own, as before.
    const res = await callModel(
      deps,
      learner.id,
      day,
      {
        purpose: 'extraction',
        tier: 'smart',
        promptVersion: version,
        // A study reading also says what kind of page it is (issue #259); homework never does.
        system: `${system}${line ? `\n\n${line}` : ''}${lean ? `\n\n${LEAN_RULES}` : ''}${extra ? `\n\n${extra}` : ''}`,
        contents,
        schema,
        // Homework is at most 12 tasks without worked solutions: a smaller limit, so a
        // reading that runs on is cut off after seconds, not after 40 (live finding 2).
        maxOutputTokens: opts.homework ? 8_000 : 12_000,
        temperature: 0.3,
        timeoutMs: 120_000,
        // Read once in the background: time to think (see generate.ts).
        thinkingBudget: 2048,
      },
      chosen.reservation,
    );
    const { kept, lost } = keptAndLost(res.json, keep);
    if (lost.length > 0)
      console.warn(
        `[forms] extraction: ${lost.length} written outside the choice (${[...new Set(lost.map((l) => l.name))].join(',')})`,
      );
    return { ...res, json: kept, lost: lost.length, fallback: chosen.how === 'fallback' };
  };
  return { learner, timezone: tz, read };
}
