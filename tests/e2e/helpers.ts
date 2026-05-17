// Shared E2E helpers — authenticated signup, learner creation, etc.
//
// The fake-server holds one in-memory store across the process, so each
// test gets a unique email to keep accounts isolated. Tokens come back via
// the `dev-server-fake` signUp shortcut (mints + binds at signup time).

import { type APIRequestContext, expect } from '@playwright/test';

let seq = 0;

export function uniqueEmail(prefix = 'e2e'): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@learnbuddy.test`;
}

export type AuthedAccount = {
  email: string;
  token: string;
  userId: string;
  accountId: string;
};

export async function signUpAccount(
  request: APIRequestContext,
  email = uniqueEmail(),
): Promise<AuthedAccount> {
  const res = await request.post('/auth/account/signup', {
    data: {
      email,
      password: 'super-secret-1',
      locale: 'de',
      country_code: 'DE',
    },
  });
  expect(res.status(), `signup ${email}`).toBe(201);
  const body = (await res.json()) as {
    account_id: string;
    user_id: string;
    session: { access_token: string } | null;
  };
  expect(body.session?.access_token).toBeTruthy();
  return {
    email,
    token: body.session!.access_token,
    userId: body.user_id,
    accountId: body.account_id,
  };
}

export type AuthedLearner = AuthedAccount & { learnerId: string };

export async function createLearner(
  request: APIRequestContext,
  account: AuthedAccount,
  display_name = 'Anna',
): Promise<AuthedLearner> {
  const res = await request.post('/learners', {
    headers: { authorization: `Bearer ${account.token}` },
    data: {
      display_name,
      birth_year: 2010,
      grade_level: 7,
      ui_locale: 'de',
      avatar_id: 1,
      preferred_answer_mode: 'voice',
    },
  });
  expect(res.status(), `create learner ${display_name}`).toBe(201);
  const learner = (await res.json()) as { id: string };
  return { ...account, learnerId: learner.id };
}

export function authedHeaders(a: AuthedAccount, learnerId?: string): Record<string, string> {
  const h: Record<string, string> = { authorization: `Bearer ${a.token}` };
  if (learnerId) h['x-learner-id'] = learnerId;
  return h;
}

export async function createSubject(
  request: APIRequestContext,
  l: AuthedLearner,
  name = 'Mathe',
): Promise<string> {
  const res = await request.post(`/learners/${l.learnerId}/subjects`, {
    headers: authedHeaders(l, l.learnerId),
    data: { name, subject_kind: 'math', color_hex: '#6B8AFD' },
  });
  expect(res.status(), `create subject ${name}`).toBe(201);
  const subj = (await res.json()) as { id: string };
  return subj.id;
}
