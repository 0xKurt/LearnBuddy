# History screen redesign — #548

> **Changed by #599 (library area).** This ledger describes the state of #548. Since #599 the page is titled "Verlauf" with the day and time of the newest message under it (`ui_kits/app/More.jsx:51`; `memory:history.title`, `memory:history.when`). `buddy:thread.title` names the list for a screen reader. The ⋯ menu still calls the place "Alle Nachrichten" (`buddy:area.history`) — that row belongs to the menu.

Prepared on published Memory main `6d8166aec6552ee4a387362ae0e6dc266c4364bf`. Four publication paths including central delivery status; the three screen files are `apps/mobile/app/history.tsx`, `tests/web/redesign-history.spec.ts` and this ledger. Memory #585 is genuinely published. No new tokens, routes, API props or controllers.

## Final presentation and contracts

History uses published Conversation and the shared header Orb. Day groups use canonical SPACE.lg spacing; the older-page action is quiet and inherits live reduced-motion BusyIndicator. Empty content has no duplicate body Orb. There is no Composer or inert send/retry control.

Virtualized day groups, oldest-ID cursor pagination, ID-based page/poll merging, refresh, background-error preservation and scroll anchoring remain unchanged. Published keyed UndoSheet, local actionable undo errors, contact-enabled context, receipts, conflict refresh/cache and actual action identities remain intact. The route's presentation delta is identical to its accepted earlier draft; restoration preserves published Background, Capture, typography and shared controls without pending source copies.

## Actual verification

Frozen install, mobile and strict browser-spec typechecks, scoped lint, format and diff check pass. Existing day-group, thread-merge, Conversation and frozen-token checks pass: 36 tests across four files. Current source-check logs: `/tmp/learnbuddy-history-7ea-{install,tsc,spec-tsc,lint,tests}.log`.

The accepted local app/API/PostgreSQL matrix on actual `82df0681` passes all four Pastell/Meer light/dark cases at 360×740 and 390×844 (1.2 minutes). It creates real Handball conversation actions, proves persisted messages after reload, no Composer, genuine first undo transport failure with visible in-sheet error, a forwarded successful retry and return navigation. Actual Settings appearance selection, strict fit, axe and 44-point targets remain enabled. Log: `/tmp/learnbuddy-history-82df-browser.log`; 24 screenshots and reports are preserved under task `learnbuddy-redesign/history/final-82df` and `/tmp/learnbuddy-history-82df-browser-artifacts`. Current source identity/hashes are in `/tmp/learnbuddy-history-7ea-source`; the original verified source remains `/tmp/learnbuddy-history-82df-source`.

The relevant 82df→7ea and 7ea→d6 comparisons of History, Conversation, UndoSheet, HomeAct, Screen, BottomBar, ListGroup and Glow is empty. Material/Library/Subject publication does not change this screen’s controller or rendering, so no duplicate browser run is claimed.

The screen is reached through the supported `/history` route: the existing More menu has no History item. No navigation action was invented. Earlier f71 preparation screenshots remain historical provenance; the current matrix verifies the genuinely published shared integration rather than substituting that older proof.

## Limits and delivery

Native virtualization, keyboard, large text and screen-reader behavior remain device verification gaps. No native or final whole-walk pass is claimed. This four-path publication scope is uncommitted; ordered integration, root review and normal publication hooks remain required. No pending source is copied into this unit.

The actual d6 restoration is conflict-free and leaves route/spec bytes unchanged. Accepted 7ea scoped checks and 82df browser evidence retain their stated provenance; no duplicate standalone test or matrix run is claimed. Final Memory-base restoration preserves the additive Row indicator default and complete duration union; normal publication hooks will verify the final tree.
