// One reading of a sheet's photos with the model. docs/architecture.md §Material.

import type { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { localParts } from '../../lib/time.js';
import { learnerTimezone } from '../../lib/zone.js';
import { callModel } from '../../llm/call.js';
import type { LlmMessage, LlmPart, LlmResult } from '../../llm/gateway.js';
import { curriculumBlock } from '../curriculum/state.js';
import { availableLine, chooseForms, keptAndLost, offered } from '../practice/formChoice.js';
import { choiceKey, storeChoice, storedChoice } from './formMemory.js';
import { ageOn } from '../identity/model.js';
import { LEAN_RULES, HomeworkExtraction } from './extract.js';
import { readingCatalogue, readingSystem } from './readingPrompt.js';
import { streamReading, type ReadingConsumer } from './streamReading.js';
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACTION_SCHEMA,
  HOMEWORK_SCHEMA,
  StudyExtraction,
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
  onReading?: ReadingConsumer,
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
  opts: {
    homework: boolean;
    parts: LlmPart[];
    now: Date;
    /** The photographed material: its stored choice of forms is used and kept (F5-2, #657). */
    materialId?: string;
  },
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
  const fullSystem = readingSystem(opts.homework);
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
  // A reading of this sheet chose before (a clarification, a reading run again): that choice
  // stands, no second choosing call with the same photos (F5-2, #657). A choice the model made
  // is kept for the next one; one that failed (`fallback`) is not.
  const key = choiceKey(version, deps.config.FORMS_OFF);
  const choose: () => ReturnType<typeof chooseForms> = async () => {
    const known = opts.materialId ? await storedChoice(deps.db, opts.materialId, key) : null;
    const chosen = await chooseForms(deps, learner.id, day, {
      purpose: 'extraction',
      promptVersion: version,
      system: fullSystem,
      contents,
      full: opts.homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA,
      chooser: (offer) => readingCatalogue(offer, opts.homework),
      known,
    });
    if (
      opts.materialId &&
      !known &&
      chosen.keep &&
      (chosen.how === 'chosen' || chosen.how === 'minimal')
    )
      await storeChoice(deps.db, opts.materialId, key, chosen.keep);
    return chosen;
  };
  const read: Reader = async (lean, extra, onReading) => {
    narrowed ??= choose();
    const chosen = await narrowed;
    const { schema, keep } = chosen;
    const line = availableLine(chosen);
    const system = readingSystem(opts.homework, offered(schema));
    // The first reading uses the allowance held before the choice (#665); the readings after it
    // (the rest of a long sheet, a lean retry) take their own, as before.
    const profile = deps.llm.profile.structuredOutput;
    const stream =
      onReading && profile.streamsPartialJson && profile.keepsPropertyOrder
        ? streamReading(keep, onReading)
        : null;
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
        validateOutput: (json) =>
          (opts.homework ? HomeworkExtraction : StudyExtraction).safeParse(json).success,
        // Homework is at most 12 tasks without worked solutions: a smaller limit, so a
        // reading that runs on is cut off after seconds, not after 40 (live finding 2).
        maxOutputTokens: opts.homework ? 8_000 : 12_000,
        temperature: 0.3,
        timeoutMs: 120_000,
        // No thinking (#670, docs/decisions/thinking-2026-10.md): the same sheets read with a 2048
        // budget had no fewer findings, and thought tokens come before the first question.
        thinking: 'off',
        // Which set went out, in `llm_calls` (#652): the whole schema, a choice, or the fallback.
        trace: { schemaVariant: chosen.how },
        ...(stream ? { onPartial: stream.onPartial } : {}),
      },
      chosen.reservation,
    ).finally(() => stream?.drain());
    const { kept, lost } = keptAndLost(res.json, keep);
    if (lost.length > 0)
      console.warn(
        `[forms] extraction: ${lost.length} written outside the choice (${[...new Set(lost.map((l) => l.name))].join(',')})`,
      );
    return { ...res, json: kept, lost: lost.length, fallback: chosen.how === 'fallback' };
  };
  return { learner, timezone: tz, read };
}
