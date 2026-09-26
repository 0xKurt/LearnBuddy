// Typed calls to the API (docs/architecture.md §API). Every response is
// parsed with the shared contracts; a shape mismatch is an ApiError.

import {
  AdminSessionResponse,
  AnswerResponse,
  BuddyHome,
  BuddySettingsView,
  CreateMaterialResponse,
  DeletionResponse,
  LearnerView,
  LibraryView,
  MaterialItemsView,
  MaterialView,
  MemoryList,
  MessageView,
  MeResponse,
  ReplyStreamEvent,
  SendMessageResponse,
  SessionView,
  StartStepResponse,
  TranscribeResponse,
  type AnswerRequest,
  type AppLocale,
  type CreateLearnerRequest,
  type CreateMaterialRequest,
  type SpeakRequest,
  type StartPracticeRequest,
  type StartTopicRequest,
  type TranscribeRequest,
  type UpdateBuddySettingsRequest,
  type UpdateLearnerRequest,
  type UpdateMemoryRequest,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { setAdminToken } from '../admin.js';
import { ApiError, newId, request, streamRequest } from './client.js';
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

export const createLearner = (input: CreateLearnerRequest) =>
  request('POST', '/learner', { body: input, schema: LearnerView });

export const updateLearner = (input: UpdateLearnerRequest) =>
  request('PATCH', '/learner', { body: input, schema: LearnerView });

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
    schema: z.object({ messages: z.array(MessageView), has_more: z.boolean() }),
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
) =>
  streamRequest('POST', '/buddy/messages', {
    body: { client_message_id: clientMessageId, text, reply_to_id: replyToId },
    schema: SendMessageResponse,
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

export const startStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/start`, { schema: StartStepResponse });
export const skipStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/skip`, { schema: BuddyHome });
export const undoAction = (actionId: string) =>
  request('POST', `/buddy/actions/${actionId}/undo`, { schema: BuddyHome });

export const reportOutcome = (goalId: string, outcome: 'good' | 'ok' | 'hard') =>
  request('POST', `/buddy/goals/${goalId}/outcome`, { body: { outcome }, schema: BuddyHome });

export const answerContactOptIn = (enable: boolean) =>
  request('POST', '/buddy/contact/opt-in', { body: { enable }, schema: BuddyHome });

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

export const registerPushToken = (token: string, platform: 'ios' | 'android') =>
  request('POST', '/buddy/push-tokens', { body: { token, platform } });
/** This device no longer gets Buddy's messages (signing out). */
export const unregisterPushToken = (token: string) =>
  request('DELETE', '/buddy/push-tokens', { body: { token } });

// ─────────────── material ───────────────

export const getLibrary = () => request('GET', '/materials', { schema: LibraryView });
/** The request as sent: fields with a server default (purpose) may be left out. */
export const createMaterial = (body: z.input<typeof CreateMaterialRequest>) =>
  request('POST', '/materials', { body, schema: CreateMaterialResponse });
export const submitMaterial = (id: string) =>
  request('POST', `/materials/${id}/submit`, { schema: MaterialView });
export const getMaterial = (id: string) =>
  request('GET', `/materials/${id}`, { schema: MaterialView });
export const retryMaterial = (id: string) =>
  request('POST', `/materials/${id}/retry`, { schema: MaterialView });
/** "Passt so": the pages Buddy could not read are fine as they are. */
export const acceptMissingPages = (id: string) =>
  request('POST', `/materials/${id}/pages-ok`, { schema: MaterialView });
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
export const speakItem = (id: string, body: SpeakRequest) =>
  sendWhenOnline(
    () => request('POST', `/practice/sessions/${id}/speak`, { body, schema: AnswerResponse }),
    { isConnectionError: noConnection },
  );
/** A session from something the learner named (a topic, a vocabulary list, sentences to say). */
export const startTopic = (body: StartTopicRequest) =>
  request('POST', '/practice/topic', { body, schema: SessionView });
export const revealItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/reveal`, {
    body: { item_id: itemId },
    schema: SessionView,
  });
/** "Tipp": the next prepared hint at once; with none prepared, the tutor writes one. */
export const hintItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/hint`, {
    body: { client_turn_id: newId(), item_id: itemId },
    schema: AnswerResponse,
  });
/** "Frage passt nicht": skipped here, never asked again. */
export const flagItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/items/${itemId}/flag`, { schema: SessionView });
export const finishSession = (id: string) =>
  request('POST', `/practice/sessions/${id}/finish`, { schema: SessionView });

// ─────────────── voice ───────────────

/** Speech to text for a spoken message or answer (≤ ~60 s); '' when nothing was understood. */
export const transcribe = (body: TranscribeRequest) =>
  request('POST', '/voice/transcribe', { body, schema: TranscribeResponse });
