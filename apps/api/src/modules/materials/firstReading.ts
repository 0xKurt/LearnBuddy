// The first reading of a sheet: read to its end (issue #150), checked by code, stored as
// questions on the sheet, Buddy woken. docs/architecture.md §Material.

import type { PageProblem } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { isAppError } from '../../lib/errors.js';
import { LlmError } from '../../llm/gateway.js';
import { StorageError } from '../../storage/gateway.js';
import { emitEvent } from '../buddy/events.js';
import { bumpContext, findOrCreateSubject } from '../buddy/plan.js';
import { formsOn, insertItems, samePrompt } from '../practice/items.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';
import { MOST_READINGS, MOST_UNCLEAR_SPOTS, moreRules, type PageReport } from './extract.js';
import { intoHelpSession } from './helpSession.js';
import { attachConceptImages } from './images.js';
import { partPrompts, unseenTasks } from './partTasks.js';
import { indexMaterialPassages } from './passages.js';
import { filesWhollyIn } from './pdf.js';
import { loadPhotos } from './photos.js';
import { sheetReader } from './reader.js';
import { fail, holdsLease, retryTransient } from './readingJob.js';
import { sheetQuestions } from './sheetQuestions.js';
import { applySource, photoRetentionMs, ReadingParse } from './sources.js';
import { insertUnclearSpots } from './unclear.js';
import type { MaterialRow } from './view.js';

export async function runFirstReading(deps: Deps, job: JobRow): Promise<void> {
  const materialId = String(job.payload.material_id ?? '');
  const m = await deps.db.maybeOne<MaterialRow>(`select * from materials where id = $1`, [
    materialId,
  ]);
  if (!m || m.status === 'ready' || m.status === 'awaiting_upload' || m.archived_at) {
    await finishJob(deps.db, job, deps.now(), {
      status: 'done',
      result: { outcome: 'nothing_to_do' },
    });
    return;
  }
  const started = await deps.db.query(
    `update materials set status = 'processing', read_stage = 'opening', read_stage_at = $4
      where id = $1
        and exists (select 1 from jobs where id = $2 and lease_token = $3 and status = 'running')
      returning id`,
    [materialId, job.id, job.lease_token, deps.now()],
  );
  if (started.length === 0) return; // the lease went to another run

  let loaded;
  try {
    loaded = await loadPhotos(deps, materialId);
  } catch (err) {
    // An outage is not a missing photo (storage-errors-reported-as-missing-photos).
    if (err instanceof StorageError) return retryTransient(deps, job, materialId, 'storage');
    throw err;
  }
  if (loaded.missing !== null) return fail(deps, job, materialId, 'photos_missing');
  const { photos } = loaded;
  const now = deps.now();
  const homework = m.purpose === 'homework';
  const {
    learner,
    timezone,
    read: readOnce,
  } = await sheetReader(deps, m.learner_id, {
    homework,
    parts: loaded.parts,
    now,
  });

  // Without a model nothing can read the photos: say so at once, not after minutes of futile
  // retries (p2-uf-llm-disabled-capture-dead-end). Not her sheet's fault: the run is uncounted.
  if (!deps.llm.available) return fail(deps, job, materialId, 'model_error', { uncounted: true });
  // The photos are loaded: Buddy reads them now (the card on the home says so, rule 5).
  await deps.db.query(
    `update materials set read_stage = 'reading', read_stage_at = $4
      where id = $1 and status = 'processing'
        and exists (select 1 from jobs where id = $2 and lease_token = $3 and status = 'running')`,
    [materialId, job.id, job.lease_token, deps.now()],
  );
  const read = (lean: boolean, alreadyRead: readonly string[] = []) =>
    readOnce(lean, alreadyRead.length > 0 ? moreRules(alreadyRead) : '');
  let result;
  try {
    // A run after one that was cut off starts lean at once.
    let lean = job.last_error === 'truncated';
    let res;
    try {
      res = await read(lean);
    } catch (err) {
      // Cut off at the token limit: read again at once, told to be brief (live finding 2).
      if (!(err instanceof LlmError && err.truncated) || lean) throw err;
      lean = true;
      res = await read(lean);
    }
    result = ReadingParse.safeParse(res.json);
    // The sheet has more than one answer could hold: read it again for the rest (#150).
    // A word list with fifty pairs is fifty questions — "das kunstlich deckeln ist der
    // falsche weg" (owner, 30.09.). Homework is a short list by design and is never
    // continued; a reading that had to go lean is already at the model's limit.
    // A corrected test and a notebook entry are short by design and never continued (#259).
    if (!homework && result.success && result.data.source === 'sheet') {
      for (let pass = 1; pass < MOST_READINGS && result.data.more_items; pass++) {
        const seen = [
          ...[...result.data.items, ...result.data.structured].map((it) => it.prompt),
          ...partPrompts(result.data.part_tasks),
        ];
        let next;
        try {
          next = await read(lean, seen);
        } catch (err) {
          // The rest could not be read. What was read stands, and the sheet says it is
          // incomplete rather than pretending to be whole (rule 5).
          if (err instanceof LlmError && (err.retryable || err.truncated)) break;
          throw err;
        }
        const parsed = ReadingParse.safeParse(next.json);
        if (!parsed.success) break;
        const known = new Set(seen.map(samePrompt));
        const fresh = parsed.data.items.filter((it) => !known.has(samePrompt(it.prompt)));
        const freshStructured = parsed.data.structured.filter(
          (it) => !known.has(samePrompt(it.prompt)),
        );
        const freshTasks = unseenTasks(parsed.data.part_tasks, known);
        // No progress: stop rather than ask a fourth time for the same nothing.
        if (fresh.length === 0 && freshStructured.length === 0 && freshTasks.length === 0) {
          result = { success: true, data: { ...result.data, more_items: false } } as typeof result;
          break;
        }
        // A continued reading sees the same photos, so it names the same refused tasks and the
        // same unsettled spots: only ones it has not named yet are added (issues #198, #164).
        const named = new Set(result.data.not_practicable.map((n) => samePrompt(n.task)));
        const unsettled = new Set(result.data.unclear.map((u) => samePrompt(u.task)));
        result = {
          success: true,
          data: {
            ...result.data,
            items: [...result.data.items, ...fresh],
            structured: [...result.data.structured, ...freshStructured],
            part_tasks: [...result.data.part_tasks, ...freshTasks],
            more_items: parsed.data.more_items,
            not_practicable: [
              ...result.data.not_practicable,
              ...parsed.data.not_practicable.filter((n) => !named.has(samePrompt(n.task))),
            ].slice(0, 20),
            unclear: [
              ...result.data.unclear,
              ...parsed.data.unclear.filter((u) => !unsettled.has(samePrompt(u.task))),
            ].slice(0, MOST_UNCLEAR_SPOTS),
          },
        } as typeof result;
      }
    }
  } catch (err) {
    if (isAppError(err) && err.code === 'budget_exhausted')
      return fail(deps, job, materialId, 'budget_exhausted', { uncounted: true });
    // An outage, or cut off twice: try again later; after the last run she gets an honest
    // failed card with "Nochmal lesen" (rule 5), never silence.
    if (err instanceof LlmError && err.retryable)
      return retryTransient(deps, job, materialId, err.truncated ? 'truncated' : err.kind);
    // The provider's safety filter refused this sheet: reading it again gives the same
    // answer, so it ends here with its own honest words and no retry (audit p2-T8).
    if (err instanceof LlmError && err.kind === 'blocked')
      return fail(deps, job, materialId, 'blocked');
    return fail(deps, job, materialId, 'model_error');
  }
  if (!result.success) return fail(deps, job, materialId, 'model_error');
  if (!result.data.is_learning_material)
    return fail(deps, job, materialId, 'not_learning_material');
  // What kind of page it is decides what is kept of the reading (issue #259, sources.ts).
  const sourced = applySource(result.data, m.photo_count);
  const x = sourced.reading;
  // Every form held to its own rules by code before anything is stored (`sheetQuestions.ts`).
  const checked = sheetQuestions(x, {
    locale: learner.locale,
    off: deps.config.FORMS_OFF,
    homework,
  });
  // A form switched off in this environment is not stored (#296, `config.FORMS_OFF`).
  const items = formsOn(checked, deps.config.FORMS_OFF);
  const pageProblems = pageProblemsOf(x.pages, m.photo_count);
  // "Not readable" with questions and a page that was read: one bad page must not
  // cost the whole sheet (the model says so for a cut-off page at times); the
  // page report tells Lena what is missing.
  const somePageRead = x.pages.some((p) => p.page <= m.photo_count && p.read !== 'none');
  if (!x.readable && !somePageRead) return fail(deps, job, materialId, 'unreadable');
  // A corrected test with nothing marked wrong: nothing to practise, nothing kept (#259).
  if (sourced.nothingMarked) return fail(deps, job, materialId, 'nothing_marked');
  // Read without trouble, and nothing on it is an exercise form Buddy can practise
  // (issue #198): its own reason, before the two that blame the reading or the photo. A
  // reading that NAMED the tasks it refused has said why there is nothing to practise, and
  // that is worth more to her than "something went wrong" — it also means no "Nochmal
  // lesen", because a second reading finds the same tasks (retryMaterial refuses it).
  // Read fine, and every task on it is of a form that is switched off: nothing to practise
  // now, and nothing about the reading went wrong (rule 5) — the same honest reason.
  if (items.length === 0 && (x.not_practicable.length > 0 || checked.length > 0))
    return fail(deps, job, materialId, 'form_not_practicable', {
      notPracticable: x.not_practicable,
    });
  // Questions were written but none passed validation: the reading went wrong, not the
  // photo — no lighting advice for a fine photo (empty-after-validation-says-unreadable).
  const written = x.items.length + x.structured.length + x.reading.length + x.part_tasks.length;
  if (items.length === 0)
    return fail(deps, job, materialId, written > 0 ? 'model_error' : 'unreadable');

  // The sheet this run's questions went onto (the merge target, else this material);
  // null when another run finished first or the sheet was deleted meanwhile.
  let sheetForImages: string | null = null;
  await deps.db.tx(async (tx) => {
    // A run past its lease writes nothing: the run that took over owns the sheet now.
    if (!(await holdsLease(tx, job))) return;
    const outcome = await readyTx(tx);
    await finishJob(tx, job, deps.now(), {
      status: 'done',
      result: outcome === 'ready' ? { outcome, items: items.length } : { outcome: 'nothing_to_do' },
    });
  });
  // Concept images are a bonus on top of a sheet that is already ready (issue #50):
  // attachConceptImages never throws — a vision pass or Storage that fails leaves the
  // sheet ready without images, it never becomes a failure path of the reading.
  if (sheetForImages) {
    // Search passages for the sheet that carries the text (the merge target when pages
    // joined an earlier sheet): rewritten from scratch so they follow the grown text.
    // Like the images below, a bonus on a sheet that is already ready — indexMaterialPassages
    // never throws, and a sheet without its index is still found by full text (issue #23).
    await indexMaterialPassages(deps, {
      materialId: sheetForImages,
      learnerId: learner.id,
      timezone,
    });
    // A corrected test's photos are gone already (sources.ts): nothing to crop, and nothing of it should be.
    if (x.source !== 'corrected_test')
      await attachConceptImages(deps, {
        materialId,
        sheetId: sheetForImages,
        learnerId: learner.id,
        locale: learner.locale,
        timezone,
      });
  }

  async function readyTx(tx: Db): Promise<'ready' | 'deleted'> {
    const current = await tx.one<MaterialRow>(`select * from materials where id = $1 for update`, [
      materialId,
    ]);
    if (current.status === 'ready') return 'ready'; // a concurrent run finished first
    // Deleted while it was being read: no questions, no "ready", no wake-up (repro-13).
    if (current.archived_at) return 'deleted';
    // Pages for an earlier sheet join it (migration 0011): its questions, subject and session.
    const target = current.completes_material_id
      ? await tx.maybeOne<MaterialRow>(
          `select * from materials where id = $1 and learner_id = $2 and status = 'ready'
              and archived_at is null and merged_into is null for update`,
          [current.completes_material_id, current.learner_id],
        )
      : null;
    const home = target ?? current;
    let subjectId = home.subject_id;
    if (!subjectId && x.subject) {
      subjectId = (
        await findOrCreateSubject(tx, current.learner_id, x.subject.name, x.subject.kind)
      ).id;
    }
    // A second subject on the sheet: its questions go there (found by their topics).
    const second =
      x.other_subject && x.other_subject.topics.length
        ? await findOrCreateSubject(
            tx,
            current.learner_id,
            x.other_subject.name,
            x.other_subject.kind,
          )
        : null;
    const secondTopics = new Set(
      (x.other_subject?.topics ?? []).map((t) => t.trim().toLowerCase()),
    );
    const homework = home.purpose === 'homework';
    const bySubject = new Map<string | null, typeof items>();
    for (const item of items) {
      const own =
        second &&
        second.id !== subjectId &&
        secondTopics.has((item.topic ?? '').trim().toLowerCase())
          ? second.id
          : subjectId;
      bySubject.set(own, [...(bySubject.get(own) ?? []), item]);
    }
    const itemIds: string[] = [];
    for (const [sid, group] of bySubject) {
      itemIds.push(
        ...(await insertItems(
          tx,
          {
            learnerId: current.learner_id,
            materialId: home.id,
            subjectId: sid,
            origin: homework ? 'homework' : 'material',
          },
          group,
        )),
      );
    }
    // Tasks this reading wrote no questions for, because their form is not one Buddy can
    // practise (issue #198). They travel with the sheet the learner sees: pages added to an
    // earlier sheet put theirs onto that sheet, after the ones already there.
    const notPracticable = JSON.stringify(x.not_practicable);
    if (target) {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = $2, subject_id = $3,
                              ready_at = $4, page_problems = $5, merged_into = $6,
                              items_incomplete = $7, not_practicable = $8, source = $9
          where id = $1`,
        [
          materialId,
          target.title,
          subjectId,
          now,
          JSON.stringify(pageProblems),
          target.id,
          x.more_items,
          notPracticable,
          x.source,
        ],
      );
      await tx.query(
        `update materials set extracted_text = concat_ws(E'\n\n', extracted_text, $2::text),
                              subject_id = coalesce(subject_id, $3),
                              items_incomplete = items_incomplete or $4,
                              not_practicable = $5
          where id = $1`,
        [
          target.id,
          x.extracted_text,
          subjectId,
          x.more_items,
          // The contract shows at most twenty; the sheet keeps the first twenty of them
          // rather than silently dropping the ones it already named.
          JSON.stringify([...target.not_practicable, ...x.not_practicable].slice(0, 20)),
        ],
      );
    } else {
      await tx.query(
        `update materials set status = 'ready', failure_reason = null, title = coalesce(title, $2),
                              extracted_text = $3, subject_id = $4, ready_at = $5, page_problems = $6,
                              items_incomplete = $7, not_practicable = $8, source = $9
          where id = $1`,
        [
          materialId,
          x.title,
          x.extracted_text,
          subjectId,
          now,
          JSON.stringify(pageProblems),
          // Still more on the sheet after every reading it was given (#150): said out loud
          // instead of letting a half-read sheet pass for a whole one.
          x.more_items,
          notPracticable,
          x.source,
        ],
      );
    }
    if (homework) {
      await intoHelpSession(tx, {
        learnerId: current.learner_id,
        sheetId: home.id,
        goalId: home.goal_id,
        title: target?.title ?? x.title,
        itemIds,
        now,
        // A first reading has no session to join; only a page added to a sheet does.
        joinOpen: target !== null,
      });
    }
    // Spots this reading could not settle, so the smallest clarification can be asked instead
    // of "photograph the page again" (issue #164 point 1). Like the tasks above they travel
    // with the sheet the learner sees; the questions for them do not exist until she answers.
    await insertUnclearSpots(tx, {
      learnerId: current.learner_id,
      materialId,
      sheetId: home.id,
      spots: x.unclear,
      photoCount: current.photo_count,
      now,
    });
    // The capture step Buddy asked for (or, without one, the goal's open
    // capture step) is now done — with evidence. A page added to an earlier sheet completes
    // only a step it was sent for: a later request is about other material (p2-J-01).
    if (!homework && (current.step_id || (current.goal_id && !current.completes_material_id))) {
      await tx.query(
        `update buddy_steps set state = 'done', done_source = 'evidence', finished_at = $4, version = version + 1,
                                evidence = $5
          where learner_id = $1 and kind = 'capture' and state = 'planned'
            and (id = $2 or ($2::uuid is null and goal_id = $3))`,
        [
          current.learner_id,
          current.step_id,
          current.goal_id,
          now,
          { material_id: materialId, questions: items.length },
        ],
      );
    }
    // One event per reading: pages added to a sheet wake Buddy about that sheet again
    // (merged-part-no-wake); the event is the part's, the check looks at the sheet.
    await emitEvent(
      tx,
      current.learner_id,
      homework
        ? { type: 'homework_ready', materialId: materialId, rootId: home.id }
        : { type: 'material_ready', materialId: materialId, rootId: home.id },
      now,
      { questions: items.length, ...(target ? { root_id: home.id } : {}) },
    );
    await enqueueJob(tx, {
      learnerId: current.learner_id,
      kind: 'purge_photos',
      // A corrected test's photos (a grade on them) go right after the reading (#259).
      runAt: new Date(now.getTime() + photoRetentionMs(x.source)),
      dedupeKey: `purge:${materialId}`,
      payload: { material_id: materialId },
    });
    // A photo of something else among the pages (a letter, a recipe) is not kept at all,
    // like a whole sheet that is not learning material (docs/privacy.md).
    const foreign = pageProblems.filter((p) => p.problem === 'not_material' && p.read === 'none');
    // Only whole files: a PDF with one foreign page among the sheet's pages is kept for its
    // retention like the rest.
    const foreignFiles = filesWhollyIn(photos, new Set(foreign.map((p) => p.page)));
    if (foreignFiles.length > 0) {
      await enqueueJob(tx, {
        learnerId: current.learner_id,
        kind: 'purge_photos',
        runAt: now,
        dedupeKey: `purge:${materialId}:not_material`,
        payload: { material_id: materialId, positions: foreignFiles },
      });
    }
    await bumpContext(tx, current.learner_id);
    sheetForImages = home.id;
    return 'ready';
  }
}

/**
 * The pages that were not read completely, as the model reported them: only real
 * photo positions, each once. Lena is told about them (docs/architecture.md §Material).
 */
function pageProblemsOf(pages: PageReport[], photoCount: number): PageProblem[] {
  const out = new Map<number, PageProblem>();
  for (const p of pages) {
    if (p.read === 'all' || p.page > photoCount || out.has(p.page)) continue;
    out.set(p.page, { page: p.page, read: p.read, problem: p.problem });
  }
  return [...out.values()].sort((a, b) => a.page - b.page);
}
