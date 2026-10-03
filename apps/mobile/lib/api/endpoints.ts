// Typed calls to the API (docs/architecture.md §API). Every response is
// parsed with the shared contracts; a shape mismatch is an ApiError.

import {
  AdminSessionResponse,
  AnswerResponse,
  BuddyHome,
  BuddySettingsView,
  CreateMaterialResponse,
  DeletionResponse,
  EndRoleplayResponse,
  LearnerView,
  LibraryView,
  ListenAudioResponse,
  MaterialItemsView,
  MaterialView,
  MemoryList,
  MessageView,
  tolerantArray,
  MeResponse,
  type OutreachAction,
  OutreachActionResponse,
  ReplyStreamEvent,
  SendMessageResponse,
  SessionView,
  StartStepResponse,
  SpeakWordResponse,
  SpeechResponse,
  TranscribeResponse,
  TranscribeStreamEvent,
  type AnswerRequest,
  type AppLocale,
  type CardRecall,
  type DrillSpec,
  type CreateLearnerRequest,
  type CreateMaterialRequest,
  type ListenAudioRequest,
  type ReexplainWay,
  type SpeakWordRequest,
  SpeakStreamEvent,
  type SpeakRequest,
  type StartPracticeRequest,
  type StartTopicRequest,
  type SpeechRequest,
  type TranscribeRequest,
  type UpdateBuddySettingsRequest,
  type UpdateLearnerRequest,
  type UpdateMemoryRequest,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { setAdminToken } from '../admin.js';
import { ApiError, newId, request, streamRequest } from './client.js';
import { turnIds } from './turnIds.js';
import { dropAnswer, keepAnswer, resultOf, sendingLive } from './outboxSync.js';
import { sendWhenOnline } from './whenOnline.js';

/** The request may not have reached the API (lib/api/client.ts turns a failed fetch into this). */
const noConnection = (err: unknown) => err instanceof ApiError && err.code === 'network';

// ─────────────── identity ───────────────

export const getMe = () => request('GET', '/me', { schema: MeResponse });

export const createAccount = (locale: AppLocale, consentVersion: string) =>
  request('POST', '/account', {
    body: { locale, consent_version: consentVersion, accept_privacy: true },
    schema: z.object({ account_id: z.string() }),
  });

/** From 16 she agrees for herself — no PIN, no adult (issue #31). */
export const selfConsent = (consentVersion: string) =>
  request('POST', '/learner/consent', {
    body: { consent_version: consentVersion, accept_privacy: true },
    schema: z.object({ ok: z.boolean() }),
  });

export const createLearner = (input: CreateLearnerRequest) =>
  request('POST', '/learner', { body: input, schema: LearnerView });

export const updateLearner = (input: UpdateLearnerRequest) =>
  request('PATCH', '/learner', { body: input, schema: LearnerView });

/** A new password; for a minor's profile the server wants the parents' admin token. */
/**
 * `others_signed_out` false means the password IS set but the revoke could not be confirmed
 * (issue #131) — the card says so rather than claiming the other devices are out.
 */
export const setPassword = (password: string) =>
  request('PUT', '/account/password', {
    body: { password },
    schema: z.object({ password_set: z.boolean(), others_signed_out: z.boolean() }),
  });

export const setPin = (pin: string, currentPin?: string) =>
  request('PUT', '/account/pin', {
    body: { pin, ...(currentPin ? { current_pin: currentPin } : {}) },
  });

export async function openAdminSession(pin: string): Promise<void> {
  const res = await request('POST', '/account/admin-session', {
    body: { pin },
    schema: AdminSessionResponse,
  });
  setAdminToken(res.admin_token, res.expires_at);
}

export const exportAccount = () => request('GET', '/account/export');
export const requestDeletion = () =>
  request('POST', '/account/deletion', { schema: DeletionResponse });
export const cancelDeletion = () =>
  request('DELETE', '/account/deletion', { schema: DeletionResponse });

// ─────────────── buddy ───────────────

export const getHome = () => request('GET', '/buddy', { schema: BuddyHome });

export const getThread = (before: string) =>
  request('GET', `/buddy/thread?before=${encodeURIComponent(before)}`, {
    schema: z.object({ messages: tolerantArray(MessageView), has_more: z.boolean() }),
  });

/** Idempotent: pass the same clientMessageId when retrying. */
/**
 * A message to Buddy, with the reply streamed while it is written (onReply);
 * resolves with the stored result (docs/architecture.md §Speed).
 */
export const sendMessageStreamed = (
  text: string,
  clientMessageId: string,
  replyToId: string | null,
  onReply: (event: ReplyStreamEvent) => void,
  signal?: AbortSignal,
) =>
  streamRequest('POST', '/buddy/messages', {
    body: { client_message_id: clientMessageId, text, reply_to_id: replyToId },
    schema: SendMessageResponse,
    ...(signal ? { signal } : {}),
    onEvent: (e) => {
      if (e.event !== 'reply') return;
      try {
        const parsed = ReplyStreamEvent.safeParse(JSON.parse(e.data));
        if (parsed.success) onReply(parsed.data);
      } catch {
        // A broken progress event only means less progress shown; the result decides.
      }
    },
  });

/** "Stopp" while Buddy writes: the turn ends stopped, or the answer says it was already there. */
export const stopMessage = (clientMessageId: string) =>
  request('POST', `/buddy/messages/${clientMessageId}/stop`, { schema: SendMessageResponse });

export const startStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/start`, { schema: StartStepResponse });
export const skipStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/skip`, { schema: BuddyHome });
export const undoAction = (actionId: string) =>
  request('POST', `/buddy/actions/${actionId}/undo`, { schema: BuddyHome });

/** Her answer to a proposed deletion — the tap that decides, or the one that keeps it (#151). */
export const answerConfirmation = (pendingId: string, confirm: boolean) =>
  request('POST', `/buddy/confirmations/${pendingId}`, {
    body: { confirm },
    schema: BuddyHome,
  });

/** Her tap on "end" under a running roleplay: the feedback lands in the thread (issue #244). */
export const endRoleplay = (roleplayId: string) =>
  request('POST', `/buddy/roleplays/${roleplayId}/end`, {
    body: {},
    schema: EndRoleplayResponse,
  });

export const reportOutcome = (goalId: string, outcome: 'good' | 'ok' | 'hard') =>
  request('POST', `/buddy/goals/${goalId}/outcome`, { body: { outcome }, schema: BuddyHome });

export const answerContactOptIn = (enable: boolean) =>
  request('POST', '/buddy/contact/opt-in', { body: { enable }, schema: BuddyHome });

/** A button pressed on a notification: the API decides what it does (gaps #16, rule 5). */
export const outreachAct = (outreachId: string, action: OutreachAction) =>
  request('POST', `/buddy/outreach/${outreachId}/act`, {
    body: { action },
    schema: OutreachActionResponse,
  });

export const outreachOpened = (
  outreachId: string,
  response: 'start' | 'later' | 'not_now' | 'dismissed' | null,
) =>
  request('POST', `/buddy/outreach/${outreachId}/opened`, {
    body: { response },
    schema: BuddyHome,
  });

export const getMemory = () => request('GET', '/buddy/memory', { schema: MemoryList });
export const updateMemory = (memoryId: string, body: UpdateMemoryRequest) =>
  request('PATCH', `/buddy/memory/${memoryId}`, { body });

export const getSettings = () => request('GET', '/buddy/settings', { schema: BuddySettingsView });
export const updateSettings = (body: UpdateBuddySettingsRequest) =>
  request('PATCH', '/buddy/settings', { body, schema: BuddySettingsView });

export const registerPushToken = (token: string, platform: 'ios' | 'android', deviceId: string) =>
  request('POST', '/buddy/push-tokens', { body: { token, platform, device_id: deviceId } });
/** Signed in on this install: nobody else's messages arrive here any more. */
export const claimPushDevice = (deviceId: string) =>
  request('POST', '/push-devices/claim', { body: { device_id: deviceId } });
/** Signing out: this install gets no more messages (works without a session). */
export const releasePushDevice = (deviceId: string) =>
  request('POST', '/push-devices/release', { body: { device_id: deviceId } });

// ─────────────── material ───────────────

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
/**
 * Her answer to one spot Buddy could not read (issue #164): the reading she picks by the alias
 * the server issued, or null for "weiß ich nicht". The question for that task is then written
 * from her reading; nothing is guessed from the picture.
 */
export const clarifyUnclear = (id: string, spot: string, reading: string | null) =>
  request('POST', `/materials/${id}/unclear`, { body: { spot, reading }, schema: MaterialView });
export const deleteMaterial = (id: string) => request('DELETE', `/materials/${id}`);
export const renameMaterial = (id: string, title: string) =>
  request('PATCH', `/materials/${id}`, { body: { title }, schema: MaterialView });
/** Her questions from this material with how each went last (never the solution). */
export const getMaterialItems = (id: string) =>
  request('GET', `/materials/${id}/items`, { schema: MaterialItemsView });
/** Takes one question out for good; deleting it twice is fine. */
export const deleteMaterialItem = (materialId: string, itemId: string) =>
  request('DELETE', `/materials/${materialId}/items/${itemId}`);

// ─────────────── practice ───────────────

export const startPractice = (body: StartPracticeRequest) =>
  request('POST', '/practice/sessions', { body, schema: SessionView });
export const getSession = (id: string) =>
  request('GET', `/practice/sessions/${id}`, { schema: SessionView });
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

/** The plain request (the outbox resends with it; same client_turn_id → recorded once). */
export const postAnswer = (id: string, body: AnswerRequest) =>
  request('POST', `/practice/sessions/${id}/answer`, { body, schema: AnswerResponse });
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
        : request('POST', `/practice/sessions/${id}/speak`, { body, schema: AnswerResponse }),
    { isConnectionError: noConnection, signal: opts.signal },
  );
/**
 * One word of a speaking question, said on its own (issue #83). Nothing is stored and
 * nothing counts — the question keeps its attempts and its state.
 */
export const speakWord = (sessionId: string, body: SpeakWordRequest) =>
  request('POST', `/practice/sessions/${sessionId}/speak-word`, {
    body,
    schema: SpeakWordResponse,
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
  });

/** A session from something the learner named (a topic, a vocabulary list, sentences to say). */
export const startTopic = (body: StartTopicRequest) =>
  request('POST', '/practice/topic', { body, schema: SessionView });
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
    }),
  );
/** An "Anders erklären" tap whose answer was lost is sent again as the same turn. */
const reexplainTurns = turnIds(newId, noConnection);
/** "Anders erklären": a new explanation, the way she tapped, of a closed question's solution. */
export const reexplainItem = (id: string, itemId: string, way: ReexplainWay) =>
  reexplainTurns.run(`${id}:${itemId}:${way}`, (clientTurnId) =>
    request('POST', `/practice/sessions/${id}/reexplain`, {
      body: { client_turn_id: clientTurnId, item_id: itemId, way },
      schema: AnswerResponse,
    }),
  );
/**
 * "Die Bewertung stimmt nicht" (issue #164): the question leaves this result and future
 * practice, and its spaced-repetition effect goes back to what it was before.
 */
export const disputeVerdict = (sessionId: string, itemId: string) =>
  request('POST', `/practice/sessions/${sessionId}/items/${itemId}/dispute`, {
    schema: SessionView,
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
  request('POST', `/practice/sessions/${id}/finish`, { schema: SessionView });

// ─────────────── voice ───────────────

/**
 * Speech to text for a spoken message or answer; '' when nothing was understood.
 * A long dictation calls this once per piece (issue #19, lib/speech/dictation.ts).
 * With `onProgress` the words arrive while the model is still writing them
 * down (issue #9) — for showing only; what is used is what this call returns.
 */
export const transcribe = (
  body: TranscribeRequest,
  opts: { onProgress?: (event: TranscribeStreamEvent) => void } = {},
) =>
  opts.onProgress
    ? streamRequest('POST', '/voice/transcribe', {
        body,
        schema: TranscribeResponse,
        onEvent: (e) => {
          if (e.event !== 'progress') return;
          try {
            const parsed = TranscribeStreamEvent.safeParse(JSON.parse(e.data));
            if (parsed.success) opts.onProgress?.(parsed.data);
          } catch {
            // A half event is no reason to lose the recording.
          }
        },
      })
    : request('POST', '/voice/transcribe', { body, schema: TranscribeResponse });

/** One sentence in Buddy's natural voice (ADR 0008); voice and speed are her settings. */
export const synthesizeSpeech = (body: SpeechRequest) =>
  request('POST', '/voice/speech', { body, schema: SpeechResponse });
