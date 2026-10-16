// Typed calls to the API (docs/architecture.md §API). Every response is
// parsed with the shared contracts; a shape mismatch is an ApiError. The learning domain's own
// calls — her sheets, practice, the rehearsal — stand in learningEndpoints.ts (issue #107).

import {
  AdminSessionResponse,
  BuddyHome,
  BuddySettingsView,
  DeletionResponse,
  LearnerView,
  MemoryList,
  MessageView,
  tolerantArray,
  MeResponse,
  type OutreachAction,
  OutreachActionResponse,
  ReplyStreamEvent,
  SendMessageResponse,
  SpeechResponse,
  TranscribeResponse,
  TranscribeStreamEvent,
  type AppLocale,
  type CreateLearnerRequest,
  type SpeechRequest,
  type TranscribeRequest,
  type UpdateBuddySettingsRequest,
  type UpdateLearnerRequest,
  type UpdateMemoryRequest,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { setAdminToken } from '../admin.js';
import { ApiError, request, streamRequest } from './client.js';

/** The request may not have reached the API (lib/api/client.ts turns a failed fetch into this). */
export const noConnection = (err: unknown) => err instanceof ApiError && err.code === 'network';

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

export const exportAccount = () => request('GET', '/account/export', { wait: 'long' });
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

export const skipStep = (stepId: string) =>
  request('POST', `/buddy/steps/${stepId}/skip`, { schema: BuddyHome });
export const undoAction = (actionId: string) =>
  request('POST', `/buddy/actions/${actionId}/undo`, { schema: BuddyHome });

/** Her answer to a proposed deletion — the tap that decides, or the one that keeps it (#151). */
export const answerConfirmation = (pendingId: string, confirm: boolean) =>
  request('POST', `/buddy/confirmations/${pendingId}`, {
    body: { confirm },
    schema: BuddyHome,
    wait: 'long',
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
    wait: 'long',
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

// ─────────────── her pages ───────────────
// A sheet she sent through the chat and takes back (lib/capture/useAttachments.ts).

export const deleteMaterial = (id: string) => request('DELETE', `/materials/${id}`);

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
    : request('POST', '/voice/transcribe', { body, schema: TranscribeResponse, wait: 'long' });

/** One sentence in Buddy's natural voice (ADR 0008); voice and speed are her settings. */
export const synthesizeSpeech = (body: SpeechRequest) =>
  request('POST', '/voice/speech', { body, schema: SpeechResponse, wait: 'long' });
