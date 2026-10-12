# Memory screen — #548

Frozen preparation on published Subject main `d6e9f4f33b4d3789ce5e7ca2c88b180f4a572a21`. Nine publication paths include the central delivery overview. No commit or PR.

## Final implementation

The virtualized FlashList shows grouped paper rows with factual provenance, expiry and permanent/temporary grouping. Existing versioned edit/save, deletion confirmation, undo, refresh, stale/gone errors and authorization remain unchanged. MemoryItem reuses Row/ListGroup, Sheet and the existing inline field editor. Its chooser closes before handoff; duplicate taps, unmount, recycled memory identity and newly locked state cannot dispatch stale edit/removal callbacks.

Exact paths: app/memory; lb/ListGroup; memory/MemoryItem and its owned ignored test; theme/memory; pure motionDurations; redesign-memory browser spec and this ledger. Row adds only indicator more, preserving completed strike/ink2, default chevron, iconTone/iconSize and callback/accessibility behavior. MEMORY owns introGap 28, bottomRoom 48 and revealOffset −12; divider derives UI.border. DURATION.keyboardReveal 280 is additive to the complete published duration object. Published motion.ts is untouched; live preference is read when the existing keyboard reveal scroll executes.

## Current validation

Fresh actual d6e9 mobile TypeScript, strict browser-spec TypeScript, scoped lint and the existing 19 tests pass; earlier frozen install is valid because dependencies and lockfile are unchanged. Diff checks pass. Nineteen focused tests in three files cover MemoryItem, BaseControls and frozen-token guards, including guarded delayed handoff and chooser lifetime. The ignored MemoryItem.test.tsx is preserved and must be force-added at publication.

The retained actual 82df real API/PostgreSQL matrix passes all four appearances in 1.4 minutes (20.2, 19.7, 20.2 and 20.9 seconds). It creates an actual learner-stated preference, edits and reloads it, confirms removal, undoes it and verifies persisted restoration. Both phone sizes have strict fit, ≥44 pt targets and axe checks; the published Home helper asserts actual primary paint and Figtree. Thirty-two empty/list/chooser/confirmation images and exact base/export/runtime diff are retained in `test-results/redesign-memory-preparation/82df-final`. Earlier accepted Home df537 proof remains separately in `final`, not relabeled as current evidence.

No pending Material, Library or Chat source was copied. Future actual-main publication must preserve all shared Row/Home icons and union durations rather than replay old modules. Native keyboard/FlashList measurement, screen readers and cancellation of an already-running native smooth scroll remain unverified. Browser/source execution gating is not native cancellation proof. Protected Orb/moon and domain data remain untouched.

All eight owned source bytes restored identically before this ledger update. Relevant Row/Sheet/input/Screen/API/motion and browser helper dependencies are unchanged; Library adds its own unused-by-Memory theme module. Therefore the accepted four-case 82df browser proof remains historical and was not needlessly repeated. Current exact hashes and source comparison: `/tmp/learnbuddy-memory-d6-final-manifest.json`. The publication tree is restored onto genuinely published Subject main with additive Row APIs retained. Force-add the owned ignored MemoryItem test when staging; central delivery is path nine. No commit or push.
