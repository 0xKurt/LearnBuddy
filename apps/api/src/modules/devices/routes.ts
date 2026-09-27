// Routes of push devices; the rules are in service.ts (audit M-65, D-6).

import { PushDeviceRequest } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import { depsOf, requireUser, type AppEnv } from '../../http/context.js';
import { readBody } from '../../http/validate.js';

export const pushDeviceRoutes = new Hono<AppEnv>();

/** Signed in on this install: nobody else's messages arrive here any more. */
pushDeviceRoutes.post('/push-devices/claim', requireUser, async (c) => {
  const { device_id } = await readBody(c, PushDeviceRequest);
  const released = await depsOf(c).db.query(
    `update push_tokens set status = 'invalid', invalid_reason = 'device_switched'
      where device_id = $1 and status = 'active'
        and learner_id not in (
          select l.id from learners l join accounts a on a.id = l.account_id
           where a.auth_user_id = $2)
      returning id`,
    [device_id, c.get('user').userId],
  );
  return c.json({ ok: true, released: released.length });
});

/** Signing out: this install gets no more messages, for anyone. */
pushDeviceRoutes.post('/push-devices/release', async (c) => {
  const { device_id } = await readBody(c, PushDeviceRequest);
  await depsOf(c).db.query(
    `update push_tokens set status = 'invalid', invalid_reason = 'signed_out'
      where device_id = $1 and status = 'active'`,
    [device_id],
  );
  // The same answer whether anything was bound: the endpoint reveals nothing.
  return c.json({ ok: true });
});
