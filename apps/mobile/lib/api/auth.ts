// Auth API helpers. Doc 04 §auth.

import { z } from 'zod';
import type { AccountSignup, AccountConsentInput } from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';
import { setSession } from '../auth/session.js';

const SignupResponse = z.object({
  account_id: z.string(),
  user_id: z.string(),
  requires_verification: z.boolean(),
  session: z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
      expires_at: z.number().nullable(),
    })
    .nullable(),
});
export type SignupResponse = z.infer<typeof SignupResponse>;

export async function signup(input: AccountSignup): Promise<SignupResponse> {
  const res = await api('/auth/account/signup', {
    method: 'POST',
    body: input,
    schema: SignupResponse,
    idempotencyKey: newIdempotencyKey(),
  });
  if (res.session) {
    await setSession({
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
      user_id: res.user_id,
      account_id: res.account_id,
    });
  }
  return res;
}

const ConsentResponse = z.object({
  account_id: z.string(),
  version: z.string(),
  accepted_at: z.string(),
});
export type ConsentResponse = z.infer<typeof ConsentResponse>;

export async function recordConsent(input: AccountConsentInput): Promise<ConsentResponse> {
  return api('/auth/account/consent', {
    method: 'POST',
    body: input,
    schema: ConsentResponse,
  });
}
