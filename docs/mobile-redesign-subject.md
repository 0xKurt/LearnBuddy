# Subject redesign — #548

> **Changed by #599 (library area).** This ledger describes the state of #548. Since #599 a sheet's row carries its subject's tone tile with the sheet sign, the day and what it holds, and ends in the 32 pt pill (`ui_kits/app/More.jsx:70–71`). Its action sheet has "Fragen ansehen" with a chevron and the other rows without one, deleting in the danger colour (More.jsx:82–87). "Darum ging es" is the same sentence-case label as "Blätter"; its hint line and `library:subject.topics_hint` are gone. Empty and gone are the design's left-aligned block (`ui_kits/app/Gaps.jsx:44–67`). Starting a sheet lives in `components/library/useStartMaterial.ts`.

Prepared on published Library #583, main `7ea4d4634de25b419db3b75d608c0ebb33db21a2`. Seventeen publication paths including central delivery status. No new route, schema, dictionary, library or production fixture. The Subject Sheet opener uses its factual material title through a pure optional MaterialRow label; Library retains its direct-questions label.

## Final source direction

The real subject/unsorted ID still controls query, pull/error/loading, sheet/exercise/topic data and empty/missing recovery. Materials and exercises use grouped paper rows; actual start/speech/retry/delete callbacks, IDs, shared deletion serialization, cache invalidation and DELETE without Undo remain intact. The actual merged materialPresentation, MaterialRow and useMaterialAct are reused; no old duplicated controller/status helper is restored.

The sole MaterialCard presentation is a material row plus existing action Sheet. Its original status/failure/photo/not-practicable notes and material-specific speech/retry/delete labels remain factual. Dead EntryCard/card branch/tone plumbing and new unused LIBRARY statusGap/materialMark roles are removed after genuine caller searches; KIND_TONE and emptyBodyWidth remain. No new visual token is required.

Four existing Capture/core-loop-material/Sources/Tour selectors now follow the actual Subject row → visible action Sheet → Fragen ansehen path while retaining route, content and payload assertions. Library recent MaterialRow still navigates directly.

## Handoff lifetime

The new uncommitted menu initially queued callbacks without a lifetime fence. Seven mounted cases failed before the bounded local correction, including unmount, ID replacement, newly disabled state, duplicate/reopened chooser and a separate primary action during pending handoff. This is a pre-publication draft defect, not a shipped card regression. The guard preserves SHEET_SWAP_MS, cancels on unmount/identity change, checks current ID/locks and callback, blocks duplicate/reopen/primary while pending, and retains ordinary allowed start/exactly-once action. All eight cases pass; Sheet is mocked only for mounted lifetime isolation and real Sheet behavior is verified below.

## Current evidence and limits

Frozen install, mobile and strict five-spec TypeScript, scoped lint/format/diff pass. Twenty-one tests across six files pass: eight lifetime, five adapted actual material/speech/status cases, ExerciseCard, MaterialAct/MaterialRow and frozen-token guards. External TypeScript configuration resolves actual workspace contracts/Node types; no source shim.

Real local API/PostgreSQL Subject matrix passes 1/1 in 1.2 minutes on this base: eight selected family/mode appearances at both phones; painted palette/Figtree/strict fit/44 pt/axe; material action/confirmation Sheet, cancellation, actual material route, first real DELETE transport failure and visible inline error, second real DELETE success with same ID/no Undo, unsorted empty and missing-subject recovery. Earlier no-error success proof and timer red logs remain separate. Final 26 PNGs are saved in test-results/redesign-subject-preparation/7ea-name-final. Before-name proof and exact-selector/closing-portal diagnostics remain separately labeled; readiness waits for actual Sheet dismissal before checking the unique material page heading, without changing production timing.

Native Sheet coordination/keyboard/screen-reader interaction and final whole walkthrough remain separate evidence. Final source and rendered review are accepted; normal publication gates remain pending. No commit or PR yet.
