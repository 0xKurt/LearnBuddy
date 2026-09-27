// Account holder, learner profile, PIN gate, privacy. docs/privacy.md.

import {
  AdminSessionRequest,
  CreateAccountRequest,
  CreateLearnerRequest,
  SetPasswordRequest,
  SetPinRequest,
  UpdateLearnerRequest,
  type LearnerView,
  type MeResponse,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  assertAccountHolder,
  assertAccountHolderOf,
  depsOf,
  hasValidAdminToken,
  requireAccount,
  requireAccountAnyConsent,
  requireLearner,
  requireUser,
  type AppContext,
  type AppEnv,
} from '../../http/context.js';
import { readBody } from '../../http/validate.js';
import type { Deps } from '../../deps.js';
import { isCheckViolation, isUniqueViolation } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { consume, limitError, lockedUntil, resetCounter } from '../../lib/limits.js';
import { isValidTimeZone } from '../../lib/time.js';
import {
  ageOn,
  findAccountByUser,
  findLearner,
  hashPin,
  isMinor,
  issueAdminToken,
  MINOR_AGE,
  verifyPin,
  type AccountRow,
  type LearnerRow,
} from './model.js';
import { cancelDeletion, exportAccount, requestDeletion } from './privacy.js';

export const identityRoutes = new Hono<AppEnv>();

function learnerView(l: LearnerRow, now: Date): LearnerView {
  return {
    id: l.id,
    relation: l.relation,
    display_name: l.display_name,
    birth_date: l.birth_date,
    is_minor: isMinor(l, now),
    level: l.level,
    grade: l.grade,
    locale: l.locale,
    version: l.version,
  };
}

/** A fresh password sign-in (within 5 minutes; a token refresh does not count). */
function signedInJustNow(c: AppContext): boolean {
  const authAt = c.get('user').authenticatedAt;
  return authAt !== null && depsOf(c).now().getTime() / 1000 - authAt < 300;
}

/** The age and relation rules for a birth date (creation and correction alike). */
function checkBirthDate(relation: 'self' | 'child', birthDate: string, now: Date): void {
  const age = ageOn(birthDate, now);
  if (age < 4 || age > 110)
    throw new AppError('invalid_input', 'Implausible birth date', { reason: 'birth_date' });
  if (relation === 'self' && age < MINOR_AGE) {
    // DSGVO Art. 8: under 16s cannot hold the account themselves.
    throw new AppError('forbidden', 'An adult has to set up the account', {
      reason: 'account_holder_too_young',
    });
  }
}

/**
 * Checks the parents' PIN under the shared lockout (lib/limits.ts, D-14):
 * every attempt is counted atomically before the hash is compared, so a burst
 * of parallel guesses cannot get more than 5 checked; the 5th wrong one locks
 * for 15 minutes, escalating. The right PIN clears count and lock. Every route
 * that takes the PIN goes through here (H-17, H-18).
 */
async function checkPin(deps: Deps, account: AccountRow, pin: string): Promise<void> {
  if (!account.pin_hash) throw new AppError('conflict', 'No PIN set', { reason: 'pin_not_set' });
  const now = deps.now();
  const attempt = await consume(deps.db, 'pin', account.id, now);
  if (!attempt.allowed) throw limitError(attempt);
  if (await verifyPin(pin, account.pin_hash)) {
    await resetCounter(deps.db, 'pin', account.id);
    return;
  }
  if (attempt.lockedUntil) {
    throw limitError({
      allowed: false,
      reason: 'locked',
      until: attempt.lockedUntil,
      retryAfterMs: attempt.lockedUntil.getTime() - now.getTime(),
    });
  }
  throw new AppError('forbidden', 'Wrong PIN', { reason: 'wrong_pin' });
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
          // The hold is over: it is being carried out (not "planned for a past date").
          deletion_running:
            account.deletion_started_at !== null ||
            (account.deletion_due_at !== null && account.deletion_due_at <= now),
          consent_current: account.consent_version === deps.config.CONSENT_VERSION,
        }
      : null,
    learner: learner ? learnerView(learner, now) : null,
    consent_version: deps.config.CONSENT_VERSION,
    capabilities: { model: deps.llm.available, push: deps.push.enabled },
  };
  return c.json(body);
});

/**
 * Records consent to the current privacy text and creates the account
 * (idempotent). Agreeing again for an account with a minor's profile is the
 * account holder's decision: it needs the parents' PIN (admin token) — or,
 * while no PIN exists, a fresh password sign-in — and renews the recorded
 * parental consent in the same transaction (M-2).
 */
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
  const existing = await findAccountByUser(deps.db, c.get('user').userId);
  const learner = existing ? await findLearner(deps.db, existing.id) : null;
  if (existing && learner && isMinor(learner, now)) {
    c.set('account', existing);
    if (existing.pin_hash) {
      if (!hasValidAdminToken(c))
        throw new AppError('admin_required', 'An adult has to confirm this with the PIN');
    } else if (!signedInJustNow(c)) {
      throw new AppError('forbidden', 'Sign in again to agree', { reason: 'reauth_required' });
    }
  }
  const row = await deps.db.tx(async (tx) => {
    const acc = await tx.one<{ id: string }>(
      `insert into accounts (auth_user_id, locale, consent_version, consent_at)
       values ($1, $2, $3, $4)
       on conflict (auth_user_id) do update
         set consent_version = excluded.consent_version, consent_at = excluded.consent_at
       returning id`,
      [c.get('user').userId, input.locale, input.consent_version, now],
    );
    // The parents' consent for a child profile follows the text they agreed to.
    await tx.query(
      `update learners set minor_consent_version = $2, minor_consent_at = $3
        where account_id = $1 and relation = 'child'`,
      [acc.id, input.consent_version, now],
    );
    return acc;
  });
  return c.json({ account_id: row.id }, 201);
});

/**
 * Creates the one learner profile. A child profile (any age up to 18, D-8)
 * records the parents' consent, and may carry the parents' first PIN, set in
 * the same transaction: onboarding is one request, with nothing left half
 * done if the connection drops or the sign-in has aged (H-20, H-21).
 */
identityRoutes.post('/learner', requireUser, requireAccount, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, CreateLearnerRequest);
  const now = deps.now();
  checkBirthDate(input.relation, input.birth_date, now);
  const child = input.relation === 'child';
  if (child && !input.minor_consent) {
    throw new AppError('invalid_input', 'Consent of the account holder is required', {
      reason: 'minor_consent_required',
    });
  }
  const account = c.get('account');
  const tzHeader = c.req.header('x-timezone');
  const timezone = tzHeader && isValidTimeZone(tzHeader) ? tzHeader : 'Europe/Berlin';
  const pinHash = input.pin ? await hashPin(input.pin) : null;
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
          child ? account.consent_version : null,
          child ? now : null,
        ],
      );
      await tx.query(
        `insert into buddy_settings (learner_id, timezone) values ($1, $2) on conflict (learner_id) do nothing`,
        [l.id, timezone],
      );
      // Only a first PIN: an existing one is changed with the current PIN (PUT /account/pin).
      if (pinHash) {
        await tx.query(`update accounts set pin_hash = $2 where id = $1 and pin_hash is null`, [
          account.id,
          pinHash,
        ]);
      }
      return l;
    });
    return c.json(learnerView(learner, now), 201);
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('conflict', 'This account already has a learner profile', {
        reason: 'learner_exists',
      });
    if (isCheckViolation(err))
      throw new AppError('invalid_input', 'The profile breaks a data rule', {
        reason: 'profile_invalid',
      });
    throw err;
  }
});

/**
 * Changes the profile. Name, level, grade and language are the learner's own;
 * a birth-date correction (GDPR Art. 16) decides who counts as a minor, so for
 * a minor's profile it needs the parents' PIN, and the new date is checked
 * against the same rules as at creation (M-3).
 */
identityRoutes.patch('/learner', requireUser, requireAccount, requireLearner, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, UpdateLearnerRequest);
  const learner = c.get('learner');
  const birthDate = input.birth_date ?? learner.birth_date;
  if (birthDate !== learner.birth_date) {
    assertAccountHolder(c);
    checkBirthDate(learner.relation, birthDate, deps.now());
  }
  const level = input.level ?? learner.level;
  const grade =
    level === 'school' ? (input.grade !== undefined ? input.grade : learner.grade) : null;
  const updated = await deps.db.tx(async (tx) => {
    const rows = await tx.query<LearnerRow>(
      `update learners set display_name = $3, level = $4, grade = $5, locale = $6,
                           birth_date = $7, version = version + 1
        where id = $1 and version = $2 returning *`,
      [
        learner.id,
        input.version,
        input.display_name ?? learner.display_name,
        level,
        grade,
        input.locale ?? learner.locale,
        birthDate,
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

/**
 * Sets or changes the parents' PIN. Proof that the adult is here:
 * - changing it: the current PIN, counted by the shared lockout (checkPin);
 * - a forgotten PIN: a password sign-in within the last 5 minutes, at most
 *   5 times an hour, and never while the PIN is locked (a lock cannot be
 *   side-stepped by replacing the PIN);
 * - the first PIN of a minor's profile: a fresh sign-in as well (a child
 *   holding the phone must not set it).
 */
identityRoutes.put('/account/pin', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, SetPinRequest);
  const account = c.get('account');
  const now = deps.now();
  const fresh = signedInJustNow(c);
  if (account.pin_hash) {
    if (input.current_pin) {
      await checkPin(deps, account, input.current_pin);
    } else {
      const locked = await lockedUntil(deps.db, 'pin', account.id, now);
      if (locked) {
        throw limitError({
          allowed: false,
          reason: 'locked',
          until: locked,
          retryAfterMs: locked.getTime() - now.getTime(),
        });
      }
      if (!fresh)
        throw new AppError('forbidden', 'Current PIN required', { reason: 'pin_required' });
      const recovery = await consume(deps.db, 'pin_recovery', account.id, now);
      if (!recovery.allowed) throw limitError(recovery);
    }
  } else if (!fresh) {
    const learner = await findLearner(deps.db, account.id);
    if (learner && isMinor(learner, now)) {
      throw new AppError('forbidden', 'Sign in again to set the PIN', {
        reason: 'reauth_required',
      });
    }
  }
  await deps.db.query(`update accounts set pin_hash = $2 where id = $1`, [
    account.id,
    await hashPin(input.pin),
  ]);
  await resetCounter(deps.db, 'pin', account.id);
  return c.json({ pin_set: true });
});

identityRoutes.post('/account/admin-session', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, AdminSessionRequest);
  const account = c.get('account');
  await checkPin(deps, account, input.pin);
  const { token, expiresAt } = issueAdminToken(
    deps.config.ADMIN_TOKEN_SECRET,
    account.id,
    deps.now(),
  );
  return c.json({ admin_token: token, expires_at: expiresAt.toISOString() });
});

// ─────────────── sign-in details ───────────────

/**
 * A new password for the account. It goes through the API (not straight to
 * Supabase Auth from the app) so that for a minor's profile the parents' PIN
 * is checked here, on the server (M-1, H-19): the child holding the phone
 * cannot take over the parents' login and, with it, the PIN reset.
 */
identityRoutes.put('/account/password', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const input = await readBody(c, SetPasswordRequest);
  const account = c.get('account');
  assertAccountHolderOf(c, await findLearner(deps.db, account.id));
  await deps.auth.updatePassword(c.get('user').userId, input.password);
  return c.json({ password_set: true });
});

// ─────────────── privacy ───────────────
// Export and deletion work for every account, also one whose profile was never
// finished (M-4) and one whose consent is outdated: data subject rights do not
// depend on either. For a minor's profile they need the parents' PIN.

identityRoutes.get('/account/export', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const account = c.get('account');
  assertAccountHolderOf(c, await findLearner(deps.db, account.id));
  const data = await exportAccount(deps.db, account.id);
  c.header('content-disposition', 'attachment; filename="learnbuddy-export.json"');
  return c.json(data);
});

identityRoutes.post('/account/deletion', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const account = c.get('account');
  assertAccountHolderOf(c, await findLearner(deps.db, account.id));
  const due = await requestDeletion(deps, account.id);
  return c.json({ deletion_due_at: due.toISOString() }, 202);
});

identityRoutes.delete('/account/deletion', requireUser, requireAccountAnyConsent, async (c) => {
  const deps = depsOf(c);
  const account = c.get('account');
  assertAccountHolderOf(c, await findLearner(deps.db, account.id));
  await cancelDeletion(deps, account.id);
  return c.json({ deletion_due_at: null });
});
