# 08 — Cost and Credits

The app uses internal credit accounting to keep LLM spend predictable per account. Credits are never shown to the user. They exist purely so the API can refuse runaway use without surprising bills, and so the developer can monitor margins.

## Credit unit

**1 credit = $0.0001 USD of underlying LLM spend.**

That is, 10,000 credits = $1.00 of provider cost. The conversion is computed at the gateway from Vertex's reported token counts × the official Gemini 2.5 Flash-Lite price list:

- Input: $0.10 per 1M tokens (text and image).
- Output: $0.40 per 1M tokens.

```ts
// apps/api/lib/credits/cost.ts
export function costToCredits(input_tokens: number, output_tokens: number) {
  const cost_usd =
    (input_tokens / 1_000_000) * 0.10 +
    (output_tokens / 1_000_000) * 0.40;
  return Math.ceil(cost_usd / 0.0001);
}
```

The conversion ratio (`0.0001`) is held as a constant so we can re-denominate later without changing every call site. Tier allotments below are in absolute credits, not in dollars.

## Estimated costs per action

Action estimates used for the **pre-call debit** (refunded if the call fails). Settlement after the call adjusts to actual cost.

| Action | Estimate | Typical actual | Cap |
|---|---|---|---|
| `visionExtractAndGenerate` (2-photo material, 10 items) | 20 | 15–25 | 60 |
| `regenerateFromText` (10 additional items) | 8 | 6–12 | 25 |
| `evaluateAnswer` (one turn) | 1 | 0.5–2 | 5 |
| `explain` | 3 | 2–5 | 8 |
| Local-evaluated attempt | 0 | 0 | 0 |
| Practice-run variant | 0 | 0 | 0 |

A heavy user — 30 photo materials per month, 150 LLM-graded answers, 30 explains — runs ≈ 30 × 20 + 150 × 1 + 30 × 3 = 840 credits/month = $0.084 of provider cost.

The Standard tier's 4,000 credits gives substantial headroom for that profile.

## Tiers

| Tier | Monthly allotment | Rollover cap | Profile |
|---|---|---|---|
| trial (14-day, comes with the store trial) | 1,500 | n/a | 1 |
| standard | 4,000 | 12,000 (3 × allotment) | 1 |
| plus | 10,000 | 30,000 (3 × allotment) | 1 |

The two paid tiers differ only by credit allotment. Plus is for heavy users — capturing lots of new material per month, running many vision-heavy sessions. An account always has exactly one learner profile.

- **Allotment** is granted on the first day of each billing cycle.
- **Rollover cap** is the maximum balance the bucket can hold; any grant in excess is dropped (logged as `credit_event` with `reason='rollover_capped'`).
- An account **always** has exactly one `credit_buckets` row.
- Switching tier (upgrade) updates `monthly_allotment` and `rollover_cap` on the existing bucket and grants the new tier's allotment immediately (prorated for the remaining days of the cycle: `floor(allotment × remaining_days / 30)`).
- Switching tier (downgrade) takes effect at the next cycle. Until then, the higher allotment remains.

## Grant logic

Two paths grant credits:

### Path A — RevenueCat webhook

`POST /webhooks/revenuecat` handles events:
- `INITIAL_PURCHASE`, `RENEWAL`: grant the tier's monthly allotment, set `current_period_start = now()`, `current_period_end = now() + 1 month`, update `subscriptions`.
- `PRODUCT_CHANGE`: apply tier change (upgrade prorated; downgrade scheduled).
- `EXPIRATION`, `CANCELLATION`: set `subscriptions.status` accordingly. No further grants; the existing bucket is left alone (learner can still use what's there).
- `BILLING_ISSUE`: set `subscriptions.status = 'grace'`. No credit changes; grace period grants the next allotment normally on next `RENEWAL`.

The webhook is idempotent on RevenueCat's `event.id`.

### Path B — Reconciliation cron

The Edge Function `credit-reconcile` runs daily at 03:00 UTC. For every account:

1. If `subscriptions.status in ('active','trial','grace')` and `credit_buckets.current_period_end < now()` (the bucket's period is stale):
   - Grant `monthly_allotment` credits.
   - Roll over excess: `new_balance = min(current_balance + monthly_allotment, rollover_cap)`.
   - Set `current_period_start = previous current_period_end`, `current_period_end += 1 month`.
   - Insert `credit_events` rows for grant and (if applicable) `rollover_capped`.

This catches missed webhooks. Webhooks remain the primary path; this is the safety net.

### Trial bucket

Created in `POST /auth/account/signup` with `tier='trial'`, `monthly_allotment=1500`, `rollover_cap=1500`, `current_period_end = now() + 14 days`. Trial expires at `trial_ends_at`; after that, the bucket stops being credited and the account must subscribe to use LLM features. The bucket itself remains until subscribed; unused trial credits do NOT carry to the first paid month (the paid grant arrives fresh).

## Atomic debit and settlement

Every LLM-using endpoint follows the same pattern.

```sql
-- 1. Pre-debit (estimate)
update credit_buckets
   set current_balance = current_balance - $estimate,
       updated_at = now()
 where account_id = $account
   and current_balance >= $estimate
returning current_balance;

-- If rowcount = 0 → 402 insufficient_credits.

-- 2. Make the LLM call.

-- 3. Settle to actual cost.
--    delta = $actual - $estimate
--    delta < 0  →  refund
--    delta > 0  →  additional debit (NOT blocked by balance check)
update credit_buckets
   set current_balance = current_balance + (- $delta),
       updated_at = now()
 where account_id = $account;

-- 4. Record the event.
insert into credit_events (account_id, learner_id, delta, reason, reference_id,
                           model, prompt_version, input_tokens, output_tokens,
                           cost_usd_micros)
values ($account, $learner, $actual, $reason, $reference,
        $model, $promptVersion, $in, $out, $costMicros);

-- 5. On LLM failure: refund the full estimate.
update credit_buckets
   set current_balance = current_balance + $estimate
 where account_id = $account;
insert into credit_events (..., delta = $estimate, reason = 'refund_failure');
```

Wrapped in a transaction. The credit bucket update uses `FOR UPDATE` to serialize concurrent operations on the same account.

The "settle exceeds estimate" case is intentional: a vision call that turns out to use 28 credits instead of the 20 estimated will go through. Hard caps in §2 above bound how much extra can be incurred.

## Soft caps in UX

The mobile app reads `/account/credits/summary` every 5 minutes (cached). Soft thresholds:

| Threshold | Behavior |
|---|---|
| `balance >= 25%` of `monthly_allotment` | Normal. |
| `10% <= balance < 25%` | Admin overview shows a small "Credits werden knapp" banner. Learner sees no change. |
| `0 < balance < 10%` | Admin banner becomes "Heute noch wenige neue Fragen möglich." Learner sees regular flow until insufficient. |
| `balance == 0` | Admin banner: "Diesen Monat ist Schluss — Aufstockung beginnt am [period_end]." Learner sees "Heute haben wir genug geübt — bis morgen!" when trying to add new material; existing materials and practice runs still work. |

The learner never sees a numeric balance. Messaging is framed as "today's quota," not "credits left."

## Abuse prevention

- Per-endpoint rate limits in doc 04 §rate-limits cut off pathological clients before they reach credit exhaustion.
- An account that hits `insufficient_credits` more than 3 times in 24 hours has further `POST /materials` debited at `1.5×` estimate (still settled to actual). This nudges retries without inviting unlimited free uses.
- An account whose 30-day rolling spend exceeds 5× the standard tier's monthly allotment is automatically flagged in the admin spend dashboard for the developer to review.

## Admin spend dashboard

`GET /admin/spend` (header-allowlisted). Returns:

```json
{
  "today": { "usd": 4.21, "calls": 318, "families_active": 47 },
  "last_30_days": { "usd": 122.40, "calls": 9210 },
  "per_action": [
    { "reason": "vision",          "calls": 1820, "usd": 31.20 },
    { "reason": "evaluation",      "calls": 6900, "usd": 18.45 },
    { "reason": "regenerate",      "calls": 410,  "usd": 4.30 },
    { "reason": "explain",         "calls": 80,   "usd": 1.10 }
  ],
  "top_families_30d": [
    { "account_id_hash": "...", "usd": 1.82, "tier": "plus" }
  ],
  "prompt_versions": [
    { "version": "p1.0", "calls": 9210, "usd": 122.40, "success_rate": 0.991 }
  ]
}
```

No PII. The admin views aggregates.

## Monitoring

Sentry alerts:
- `LLM_CALL_FAILURE_RATE_HIGH` if vision failure rate exceeds 5 % over a 15-minute window.
- `CREDIT_REFUND_RATE_HIGH` if `refund_failure` events exceed 2 % of vision calls over an hour.
- `RATE_LIMIT_429_BURST` if 429s exceed 100 per minute.

PostHog dashboards (aggregate, no PII):
- Median credits-per-material by subject_kind.
- Median credits-per-attempt overall.
- 30-day cost trend.

## Pricing reconciliation

When the underlying Vertex pricing changes, only `apps/api/lib/credits/cost.ts` is updated. Tier allotments, rollover caps, and store prices are unaffected.

Because `cost_usd_micros` is recorded on every `credit_events` row, a re-pricing change has no retroactive effect on what was charged to bucket balances. It only affects subsequent calls.
