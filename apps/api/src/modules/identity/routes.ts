// Account holder, learner profile, PIN gate, privacy. docs/privacy.md.

import {
  AdminSessionRequest,
  CreateAccountRequest,
  CreateLearnerRequest,
  SetPinRequest,
  UpdateLearnerRequest,
  type LearnerView,
  type MeResponse,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  assertAccountHolder,
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { readBody } from '../../http/validate.js';
import { isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { isValidTimeZone } from '../../lib/time.js';
import {
  ageOn,
  findAccountByUser,
  findLearner,
  hashPin,
  isMinor,
  issueAdminToken,
  PIN_LOCK_MINUTES,
  PIN_MAX_FAILURES,
  verifyPin,
  type LearnerRow,
} from './model.js';
import { cancelDeletion, exportAccount, requestDeletion } from './privacy.js';

export const identityRoutes = new Hono<AppEnv>();

function learnerView(l: LearnerRow, now: Date): LearnerView {
  return {
    id: l.id,
    relation: l.relation,
    display_name: l.display_name,
    is_minor: isMinor(l.birth_date, now),
    level: l.level,
    grade: l.grade,
    locale: l.locale,
    version: l.version,
  };
}

identityRoutes.get('/me', requireUser, async (c) => {
  const deps = depsOf(c);
  const now = deps.now();
  const account = await findAccountByUser(deps.db, c.get('user').userId);
  const learner = account ? await findLearner(deps.db, account.id) : null;
  const body: MeResponse = {
    account: account
      ? {
          id: account.id,
          locale: account.locale as LearnerView['locale'],
          pin_set: account.pin_hash !== null,
          deletion_due_at: account.deletion_due_at ? account.deletion_due_at.toISOString() : null,
          consent_current: account.consent_version === deps.config.CONSENT_VERSION,
        }
      : null,
    learner: learner ? learnerView(learner, now) : null,
    consent_version: deps.config.CONSENT_VERSION,
    capabilities: { model: deps.llm.available, push: deps.push.enabled },
  };
  return c.json(body);
});

/** Records consent to the current privacy text and creates the account (idempotent). */
identityRoutes.post('/account', requireUser, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, CreateAccountRequest);
  if (input.consent_version !== deps.config.CONSENT_VERSION) {
    throw new AppError('conflict', 'The privacy text has changed; please review it again', {
      reason: 'consent_outdated',
      current: deps.config.CONSENT_VERSION,
    });
  }
  const now = deps.now();
  const row = await deps.db.one<{ id: string }>(
    `insert into accounts (auth_user_id, locale, consent_version, consent_at)
     values ($1, $2, $3, $4)
     on conflict (auth_user_id) do update
       set consent_version = excluded.consent_version, consent_at = excluded.consent_at
     returning id`,
    [c.get('user').userId, input.locale, input.consent_version, now],
  );
  return c.json({ account_id: row.id }, 201);
});

identityRoutes.post('/learner', requireUser, requireAccount, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, CreateLearnerRequest);
  const now = deps.now();
  const age = ageOn(input.birth_date, now);
  if (age < 4 || age > 110)
    throw new AppError('invalid_input', 'Implausible birth date', { reason: 'birth_date' });
  if (input.relation === 'self' && age < 16) {
    // DSGVO Art. 8: under 16s cannot hold the account themselves.
    throw new AppError('forbidden', 'An adult has to set up the account', {
      reason: 'account_holder_too_young',
    });
  }
  const minor = age < 16;
  if (minor && !input.minor_consent) {
    throw new AppError(
      'invalid_input',
      'Consent of the account holder is required for learners under 16',
      {
        reason: 'minor_consent_required',
      },
    );
  }
  const account = c.get('account');
  const tzHeader = c.req.header('x-timezone');
  const timezone = tzHeader && isValidTimeZone(tzHeader) ? tzHeader : 'Europe/Berlin';
  try {
    const learner = await deps.db.tx(async (tx) => {
      const l = await tx.one<LearnerRow>(
        `insert into learners (account_id, relation, display_name, birth_date, locale,
                               minor_consent_version, minor_consent_at)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [
          account.id,
          input.relation,
          input.display_name,
          input.birth_date,
          input.locale,
          minor ? deps.config.CONSENT_VERSION : null,
          minor ? now : null,
        ],
      );
      await tx.query(
        `insert into buddy_settings (learner_id, timezone) values ($1, $2) on conflict (learner_id) do nothing`,
        [l.id, timezone],
      );
      return l;
    });
    return c.json(learnerView(learner, now), 201);
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('conflict', 'This account already has a learner profile');
    throw err;
  }
});

identityRoutes.patch('/learner', requireUser, requireAccount, requireLearner, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, UpdateLearnerRequest);
  const learner = c.get('learner');
  const level = input.level ?? learner.level;
  const grade =
    level === 'school' ? (input.grade !== undefined ? input.grade : learner.grade) : null;
  const updated = await deps.db.tx(async (tx) => {
    const rows = await tx.query<LearnerRow>(
      `update learners set display_name = $3, level = $4, grade = $5, locale = $6, version = version + 1
        where id = $1 and version = $2 returning *`,
      [
        learner.id,
        input.version,
        input.display_name ?? learner.display_name,
        level,
        grade,
        input.locale ?? learner.locale,
      ],
    );
    if (rows.length === 0)
      throw new AppError('stale', 'The profile changed meanwhile; reload and try again');
    await tx.query(
      `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
      [learner.id],
    );
    return rows[0]!;
  });
  return c.json(learnerView(updated, deps.now()));
});

// ─────────────── PIN gate ───────────────

identityRoutes.put('/account/pin', requireUser, requireAccount, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, SetPinRequest);
  const account = c.get('account');
  // Proof that the adult is here: the current PIN, or having just signed in
  // with the password (within 5 minutes; a token refresh does not count).
  const authAt = c.get('user').authenticatedAt;
  const fresh = authAt !== null && deps.now().getTime() / 1000 - authAt < 300;
  if (account.pin_hash) {
    const ok = input.current_pin ? await verifyPin(input.current_pin, account.pin_hash) : false;
    if (!ok && !fresh)
      throw new AppError('forbidden', 'Current PIN required', { reason: 'pin_required' });
  } else if (!fresh) {
    // The first PIN of a minor's account guards the adult surface: the
    // child holding the phone must not be able to set it.
    const learner = await findLearner(deps.db, account.id);
    if (learner && isMinor(learner.birth_date, deps.now())) {
      throw new AppError('forbidden', 'Sign in again to set the PIN', {
        reason: 'reauth_required',
      });
    }
  }
  await deps.db.query(
    `update accounts set pin_hash = $2, pin_failed_count = 0, pin_locked_until = null where id = $1`,
    [account.id, await hashPin(input.pin)],
  );
  return c.json({ pin_set: true });
});

identityRoutes.post('/account/admin-session', requireUser, requireAccount, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, AdminSessionRequest);
  const account = c.get('account');
  const now = deps.now();
  if (!account.pin_hash) throw new AppError('conflict', 'No PIN set', { reason: 'pin_not_set' });
  if (account.pin_locked_until && account.pin_locked_until > now) {
    throw new AppError('pin_locked', 'Too many wrong attempts', {
      until: account.pin_locked_until.toISOString(),
    });
  }
  if (!(await verifyPin(input.pin, account.pin_hash))) {
    const failures = account.pin_failed_count + 1;
    await deps.db.query(
      `update accounts set pin_failed_count = $2, pin_locked_until = $3 where id = $1`,
      [
        account.id,
        failures >= PIN_MAX_FAILURES ? 0 : failures,
        failures >= PIN_MAX_FAILURES ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) : null,
      ],
    );
    throw new AppError('forbidden', 'Wrong PIN', { reason: 'wrong_pin' });
  }
  await deps.db.query(
    `update accounts set pin_failed_count = 0, pin_locked_until = null where id = $1`,
    [account.id],
  );
  const { token, expiresAt } = issueAdminToken(deps.config.ADMIN_TOKEN_SECRET, account.id, now);
  return c.json({ admin_token: token, expires_at: expiresAt.toISOString() });
});

// ─────────────── privacy ───────────────

identityRoutes.get('/account/export', requireUser, requireAccount, requireLearner, async (c) => {
  assertAccountHolder(c);
  const deps = depsOf(c);
  const data = await exportAccount(deps.db, c.get('account').id);
  c.header('content-disposition', 'attachment; filename="learnbuddy-export.json"');
  return c.json(data);
});

identityRoutes.post('/account/deletion', requireUser, requireAccount, requireLearner, async (c) => {
  assertAccountHolder(c);
  const due = await requestDeletion(depsOf(c), c.get('account').id);
  return c.json({ deletion_due_at: due.toISOString() }, 202);
});

identityRoutes.delete(
  '/account/deletion',
  requireUser,
  requireAccount,
  requireLearner,
  async (c) => {
    assertAccountHolder(c);
    await cancelDeletion(depsOf(c), c.get('account').id);
    return c.json({ deletion_due_at: null });
  },
);
