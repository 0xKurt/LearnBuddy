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
  MaterialView,
  MemoryList,
  MessageView,
  MeResponse,
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
import { newId, request } from './client.js';

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
export const sendMessage = (
  text: string,
  clientMessageId: string = newId(),
  replyToId: string | null = null,
) =>
  request('POST', '/buddy/messages', {
    body: { client_message_id: clientMessageId, text, reply_to_id: replyToId },
    schema: SendMessageResponse,
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
export const deleteMaterial = (id: string) => request('DELETE', `/materials/${id}`);

// ─────────────── practice ───────────────

export const startPractice = (body: StartPracticeRequest) =>
  request('POST', '/practice/sessions', { body, schema: SessionView });
export const getSession = (id: string) =>
  request('GET', `/practice/sessions/${id}`, { schema: SessionView });
export const answerItem = (id: string, body: AnswerRequest) =>
  request('POST', `/practice/sessions/${id}/answer`, { body, schema: AnswerResponse });
/** A recording for a speak question; retrying the same recording reuses its client_turn_id. */
export const speakItem = (id: string, body: SpeakRequest) =>
  request('POST', `/practice/sessions/${id}/speak`, { body, schema: AnswerResponse });
/** A session from something the learner named (a topic, a vocabulary list, sentences to say). */
export const startTopic = (body: StartTopicRequest) =>
  request('POST', '/practice/topic', { body, schema: SessionView });
export const revealItem = (id: string, itemId: string) =>
  request('POST', `/practice/sessions/${id}/reveal`, {
    body: { item_id: itemId },
    schema: SessionView,
  });
export const finishSession = (id: string) =>
  request('POST', `/practice/sessions/${id}/finish`, { schema: SessionView });

// ─────────────── voice ───────────────

/** Speech to text for a spoken message or answer (≤ ~60 s); '' when nothing was understood. */
export const transcribe = (body: TranscribeRequest) =>
  request('POST', '/voice/transcribe', { body, schema: TranscribeResponse });
