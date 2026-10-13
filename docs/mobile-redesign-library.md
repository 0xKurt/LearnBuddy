# Library redesign — #548

> **Changed by #599 (library area).** This ledger describes the state of #548. Since #599 the rows follow `ui_kits/app/Library.jsx`: a sheet under "Zuletzt" is its name and what it holds, without a sign before it and without the day, and ends in the 32 pt pill with the arrow (`Row action`) instead of a 44 pt quiet button. The empty page is the design's (`ui_kits/app/Gaps.jsx:44–67`): one block at the start edge on the 20 pt gutter, one action with the camera. `LIBRARY` now holds `pageTop`/`pageBottom`; `emptyBodyWidth` is gone. `library:rename` is back in all five languages.

Ready for review on published Material #582, main `caa1541c81c4085aa881afa693085f8cb946a4d4`. Twenty publication paths: nineteen owned files plus central delivery status. No new route, data contract, library or production fixture.

## Final source and tokens

Library groups actual subjects and recent photographed materials on paper rows. Recent records flatten existing subject/unsorted materials and sort factual created_at values. Existing filters, activity ordering, unsorted navigation, refresh, loading/error/empty and camera behavior remain intact; empty content has the shared header Orb only. Five dictionaries add supplied subject/recent labels and retain Material’s obsolete rename-key removal.

SubjectCard uses shared Row and real subject data. MaterialRow keeps navigation and trailing practice/speech as separate nonnested targets. materialPresentation extracts existing status/action truth, including unreadable/read-without-exercises, deleted photos, not-practicable, homework and speech. useMaterialAct preserves serialization, shared deletion ref, error/cache handling; Subject route receives only this mechanical extraction. Its later grouping/menu/handoff changes remain separate.

Legacy MaterialCard retains actual callbacks and published BusyIndicator while using canonical typography and spacing. LIBRARY owns emptyBodyWidth, statusGap and materialMark derived from TOUCH/UI. Actual zero-caller search after Material publication removes ordinary MARK and its obsolete comments from tone.ts; canonical merged EntryCard is untouched. Protected theme aliases remain for final cleanup. Current Row completed/icon/chevron APIs and all published font/motion/viewer roles remain intact.

The Library-owned proof helper reexports published Home target/shot helpers and adds the eight-look list palette/background/font matrix. Later Subject/list units consume it only after publication.

## Evidence

Fresh frozen install, mobile and strict browser TypeScript, scoped lint/format/diff pass. The original 32 focused tests across seven files pass on this base; eight additional BaseControls tests also pass (40 unique tests across eight files).

Actual local API/PostgreSQL scenario passes 1/1 in 54.7 seconds: empty Library, real worksheet processing, all eight family/mode appearances at both phones, painted palette background/ink/Figtree, strict fit/axe/44 pt targets, material and subject navigation. The independent practice button sends the exact real material_id/mode, parses SessionView and reaches its real question route. All 18 PNGs and reports are preserved under test-results/redesign-library-preparation/caa-final. Earlier Home df537 proof remains historical. Material #582 already supplies accepted genuine added-page upload/completes/returned-question evidence; that whole matrix was not duplicated here.

## Limits

Native camera/permissions, keyboard, screen readers and final whole walkthrough remain separate verification. Normal publication gates are pending source/visual review; no commit or PR yet.
