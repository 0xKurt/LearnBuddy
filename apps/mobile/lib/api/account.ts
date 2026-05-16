// Account API helpers. Doc 04 §account.

import { Account } from '@learnbuddy/shared-types';

import { api } from './client.js';

export async function getAccount(): Promise<Account> {
  return api('/account', { method: 'GET', schema: Account });
}
