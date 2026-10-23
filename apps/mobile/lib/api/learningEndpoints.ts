// The learning domain's calls to the API (docs/architecture.md §API, issue #107): her sheets, the
// practice and its sessions, the rehearsal. Every response is parsed with the shared contracts;
// a shape mismatch is an ApiError. The generic calls stand in endpoints.ts.

import {
  AnswerResponse,
  CreateMaterialResponse,
  EndRoleplayResponse,
  KeepForLaterResponse,
  LibraryView,
  ListenAudioResponse,
  MaterialItemsView,
  MaterialView,
  RehearseResponse,
  SessionView,
  SpeakStreamEvent,
  SpeakWordResponse,
  StartStepResponse,
  WorkReading,
  type AnswerRequest,
  type CardRecall,
  type CreateMaterialRequest,
  type DrillSpec,
  type ListenAudioRequest,
  type ReadWorkRequest,
  type ReexplainWay,
  type RehearseRequest,
  type SpeakRequest,
  type SpeakWordRequest,
  type StartPracticeRequest,
  type StartTopicRequest,
} from '@learnbuddy/shared-types/contracts';
import type { z } from 'zod';

import { newId, request, streamRequest } from './client.js';
import { noConnection } from './endpoints.js';
import { dropAnswer, keepAnswer, resultOf, sendingLive } from './outboxSync.js';
import { turnIds } from './turnIds.js';
import { sendWhenOnline } from './whenOnline.js';

// ─────────────── material ───────────────

/**
 * Her answer to one spot Buddy could not read (issue #164): the reading she picks by the alias
 * the server issued, or null for "weiß ich nicht". The question for that task is then written
 * from her reading; nothing is guessed from the picture.
 */
export const clarifyUnclear = (id: string, spot: string, reading: string | null) =>
  request('POST', `/materials/${id}/unclear`, { body: { spot, reading }, schema: MaterialView });
export const getLibrary = () => request('GET', '/materials', { schema: LibraryView });
/** The request as sent: fields with a server default (purpose) may be left out. */
export const createMaterial = (body: z.input<typeof CreateMaterialRequest>) =>
  request('POST', '/materials', { body, schema: CreateMaterialResponse });
export const submitMaterial = (id: string) =>
  request('POST', `/materials/${id}/submit`, { schema: MaterialView });
export const retryMaterial = (id: string) =>
  request('POST', `/materials/${id}/retry`, { schema: MaterialView });
/** "Passt so": the pages Buddy could not read are fine as they are. */
export const acceptMissingPages = (id: string) =>
  request('POST', `/materials/${id}/pages-ok`, { schema: MaterialView });
export const renameMaterial = (id: string, title: string) =>
  request('PATCH', `/materials/${id}`, { body: { title }, schema: MaterialView });
/** Her questions from this material with how each went last (never the solution). */
export const getMaterialItems = (id: string) =>
  request('GET', `/materials/${id}/items`, { schema: MaterialItemsView });
/** Takes one question out for good; deleting it twice is fine. */
export const deleteMaterialItem = (materialId: string, itemId: string) =>
  request('DELETE', `/materials/${materialId}/items/${itemId}`);

// ─────────────── practice ───────────────

export const getSession = (id: string) =>
  request('GET', `/practice/sessions/${id}`, { schema: SessionView });
/** An actual screen open, separate from the home card's read-only prefetch (#868). */
export const openPracticeSession = (id: string) => request('POST', `/practice/sessions/${id}/open`);
/** The plain request (the outbox resends with it; same client_turn_id → recorded once). */
export const postAnswer = (id: string, body: AnswerRequest) =>
  request('POST', `/practice/sessions/${id}/answer`, {
    body,
    schema: AnswerResponse,
    wait: 'long',
  });

export const startPractice = (body: StartPracticeRequest) =>
  request('POST', '/practice/sessions', { body, schema: SessionView, wait: 'long' });
/**
 * An answer. Offline it waits and is sent once the device is back online; a
 * dropped connection sends it again. Always with the same client_turn_id, so
 * the API records it once (lib/api/whenOnline.ts).
 */
export async function answerItem(id: string, body: AnswerRequest): Promise<AnswerResponse> {
  // Kept on the device until the API has it (lib/api/outbox.ts): closing the app never loses it.
  await keepAnswer(id, body);
  return sendingLive(body.client_turn_id, async () => {
    try {
      const res = await sendWhenOnline(() => postAnswer(id, body), {
        isConnectionError: noConnection,
      });
      await dropAnswer(body.client_turn_id);
      return res;
    } catch (err) {
      // Only a clear "no" drops it; server trouble keeps it for the next flush.
      if (resultOf(err) === 'refused') await dropAnswer(body.client_turn_id);
      throw err;
    }
  });
}

/**
 * A recording for a speak question; retrying the same recording reuses its
 * client_turn_id. Waits while offline, like answerItem.
 */
export const speakItem = (
  id: string,
  body: SpeakRequest,
  opts: {
    signal?: AbortSignal;
    /**
     * The judgement while the model is still listening (issue #8): the words it has
     * finished judging, in order. Nothing here is the result — that is what this call
     * returns, and only it is stored.
     */
    onProgress?: (event: SpeakStreamEvent) => void;
  } = {},
) =>
  sendWhenOnline(
    () =>
      opts.onProgress
        ? streamRequest('POST', `/practice/sessions/${id}/speak`, {
            body,
            schema: AnswerResponse,
            ...(opts.signal ? { signal: opts.signal } : {}),
            onEvent: (e) => {
              if (e.event !== 'progress') return;
              try {
                const parsed = SpeakStreamEvent.safeParse(JSON.parse(e.data));
                if (parsed.success) opts.onProgress?.(parsed.data);
              } catch {
                // A half event is no reason to fail the recording.
              }
            },
          })
        : request('POST', `/practice/sessions/${id}/speak`, {
            body,
            schema: AnswerResponse,
            wait: 'long',
          }),
    { isConnectionError: noConnection, signal: opts.signal },
  );
/**
 * Her working, photographed (issue #444): the lines copied down for her answer field, a line that
 * could not be read as null. Nothing is stored and nothing counts — she sends the copy herself.
 */
export const readWorkPhoto = (sessionId: string, body: ReadWorkRequest) =>
  request('POST', `/practice/sessions/${sessionId}/work-photo`, {
    body,
    schema: WorkReading,
    wait: 'long',
  });

/**
 * One word of a speaking question, said on its own (issue #83). Nothing is stored and
 * nothing counts — the question keeps its attempts and its state.
 */
export const speakWord = (sessionId: string, body: SpeakWordRequest) =>
  request('POST', `/practice/sessions/${sessionId}/speak-word`, {
    body,
    schema: SpeakWordResponse,
    wait: 'long',
  });

/**
 * The recording of a listening question's text (issue #210). The text itself never comes to
 * the phone — it is where every answer comes from — so this asks for the AUDIO of a question
 * and gets it back; `slow` is the same text read more slowly. Asking again is the exercise,
 * not an extra: the server serves it from the same cache as every other spoken sentence.
 */
export const listenToItem = (sessionId: string, body: ListenAudioRequest) =>
  request('POST', `/practice/sessions/${sessionId}/listen`, {
    body,
    schema: ListenAudioResponse,
    wait: 'long',
  });

/** A session from something the learner named (a topic, a vocabulary list, sentences to say). */
export const startTopic = (body: StartTopicRequest) =>
  request('POST', '/practice/topic', { body, schema: SessionView, wait: 'long' });
export const revealItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/reveal`, {
    body: { item_id: itemId },
    schema: SessionView,
  });
/** A "Tipp" whose answer was lost is asked again as the same turn (lib/api/turnIds.ts). */
const hintTurns = turnIds(newId, noConnection);
/** "Tipp": the next prepared hint at once; with none prepared, the tutor writes one. */
export const hintItem = (id: string, itemId: string) =>
  hintTurns.run(`${id}:${itemId}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${id}/hint`, {
      body: { client_turn_id: clientTurnId, item_id: itemId },
      schema: AnswerResponse,
      wait: 'long',
    }),
  );
/** A question whose answer was lost is sent again as the same turn (lib/api/turnIds.ts). */
const askTurns = turnIds(newId, noConnection);
/**
 * Her question to the tutor about the question on screen (issue #402, report #388 §1): never
 * graded, never a try. Not through the outbox, unlike an answer: a question is help in the moment,
 * not learning state, and replayed after an app kill its reply would land on a screen nobody looks
 * at — or on a question already closed. What she typed is kept on the device instead (the screen's
 * draft), so asking again after a kill is one tap; a lost reply is asked again as the same turn.
 */
export const askItem = (id: string, itemId: string, text: string) =>
  askTurns.run(`${id}:${itemId}:${text}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${id}/ask`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, text },
      schema: AnswerResponse,
      wait: 'long',
    }),
  );
/** „Merk ich mir für nachher" (issue #402): the tutor turn that offered it, now kept. */
export const keepForLater = (id: string, turnId: string) =>
  request('POST', `/practice/sessions/${id}/later`, {
    body: { turn_id: turnId },
    schema: KeepForLaterResponse,
  });
/** An "Anders erklären" tap whose answer was lost is sent again as the same turn. */
const reexplainTurns = turnIds(newId, noConnection);
/** "Anders erklären": a new explanation, the way she tapped, of a closed question's solution. */
const reexplainItem = (id: string, itemId: string, way: ReexplainWay) =>
  reexplainTurns.run(`${id}:${itemId}:${way}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${id}/reexplain`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, way },
      schema: AnswerResponse,
      wait: 'long',
    }),
  );
/** A „Warum stimmt das?" tap whose answer was lost is sent again as the same turn. */
const whyTurns = turnIds(newId, noConnection);
/** „Warum stimmt das?" (issue #388): the reason she tapped, judged by the server. */
const whyItem = (id: string, itemId: string, choice: number) =>
  whyTurns.run(`${id}:${itemId}:${choice}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${id}/why`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, choice },
      schema: AnswerResponse,
      wait: 'long',
    }),
  );
/**
 * The chips under a shown solution (`Reexplain`): a new explanation the way she tapped — or, with
 * `choice`, her pick among the reasons of „Warum stimmt das?" (#388). Both answer under it.
 */
export const explainItem = (id: string, itemId: string, way: ReexplainWay, choice?: number) =>
  choice === undefined ? reexplainItem(id, itemId, way) : whyItem(id, itemId, choice);
/**
 * "Die Bewertung stimmt nicht" (issue #164): the question leaves this result and future
 * practice, and its spaced-repetition effect goes back to what it was before.
 */
export const disputeVerdict = (sessionId: string, itemId: string) =>
  request('POST', `/practice/sessions/${sessionId}/items/${itemId}/dispute`, {
    schema: SessionView,
    wait: 'long',
  });

/** "Frage passt nicht": skipped here, never asked again. */
export const flagItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/items/${itemId}/flag`, { schema: SessionView });
/** Homework help "Später": the task stays open and comes back after the others. */
export const deferItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/items/${itemId}/defer`, { schema: SessionView });
/**
 * "Die Wörter als Karten durchgehen" (issue #147, Stufe 2): a flashcard pass over the
 * vocabulary of a finished run that did not sit. The server picks the words, so the app only
 * says which run they come from. Retrying the same tap reuses its id (lib/api/turnIds.ts), so
 * a lost reply never starts a second pass.
 */
const cardPassRequests = turnIds(newId, noConnection);
export const startCardPass = (sessionId: string) =>
  cardPassRequests.run(sessionId, (clientRequestId) =>
    request('POST', `/practice/sessions/${sessionId}/cards`, {
      body: { client_request_id: clientRequestId },
      schema: SessionView,
      wait: 'long',
    }),
  );

/**
 * One card, as SHE judged it. Nothing grades it; what it is worth to the repetition plan is
 * decided on the server (`practice/fsrs.ts` RATING). Retrying the same tap keeps its
 * client_turn_id, so the API records it once.
 */
const cardTurns = turnIds(newId, noConnection);
export const recordCard = (sessionId: string, itemId: string, recall: CardRecall) =>
  cardTurns.run(`${sessionId}:${itemId}:${recall}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${sessionId}/card`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, recall },
      schema: SessionView,
    }),
  );

/**
 * Kopfrechnen (issue #243): start a round from the range Buddy offered. The offer's action id
 * is the request id, so the same offer always opens the same round — and a lost reply is
 * picked up by the next tap instead of starting a second round.
 */
export const startDrill = (requestId: string, spec: DrillSpec) =>
  request('POST', '/practice/drills', {
    body: { client_request_id: requestId, spec },
    schema: SessionView,
    wait: 'long',
  });

/**
 * One answer of a round, checked by the server at once (code, no model). Retrying the same
 * answer keeps its client_turn_id, so it is recorded once.
 */
const drillTurns = turnIds(newId, noConnection);
export const answerDrill = (sessionId: string, itemId: string, text: string) =>
  drillTurns.run(`${sessionId}:${itemId}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${sessionId}/drill`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, text },
      schema: SessionView,
    }),
  );

/**
 * "Beenden" of a test (handed in) or of a session with nothing open; homework help with open
 * tasks is only paused by the server (decision D-5).
 */
export const finishSession = (id: string) =>
  request('POST', `/practice/sessions/${id}/finish`, { schema: SessionView, wait: 'long' });

// ─────────────── buddy's prepared steps, the roleplay and the rehearsal ───────────────

/** Her tap on "end" under a running roleplay: the feedback lands in the thread (issue #244). */
export const endRoleplay = (roleplayId: string) =>
  request('POST', `/buddy/roleplays/${roleplayId}/end`, {
    body: {},
    schema: EndRoleplayResponse,
    wait: 'long',
  });

/** A prepared practice step, started: the session it opened, with its first question. */
export const startStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/start`, { schema: StartStepResponse, wait: 'long' });

/**
 * Her recording on Buddy's rehearsal card (issue #264): measured on the server and never kept; the
 * result lands in the thread as his message.
 */
export const sendRehearsal = (body: RehearseRequest) =>
  request('POST', '/buddy/rehearsals', { body, schema: RehearseResponse, wait: 'long' });
