# Material detail — #548

> **Changed by #599 (library area).** This ledger describes the state of #548. Since #599 the page follows `ui_kits/app/Extra.jsx:108–132` as far as the API carries it: the head holds the sheet's name and "Mathe · 2 Seiten" (one line, as every head title; the whole name is in the rename field), the sheet's pages are pinned under it as small paper pages (`components/library/SheetPages.tsx`, a sign — `MaterialView` has no picture of a page) with "Daraus üben" beside them, and the questions follow. A question's card has ⋯ instead of a delete button; its sheet names the question and asks once more before deleting. Renaming and "Seite hinzufügen" stand in the head's ⋯; the latter is also the empty page's one action. Not built: the design's conversation about the sheet, its Composer and the unclear-spot card on this page — `SendMessageRequest` carries no material, and the unclear spot is a home notice of the chat.

Ready for review on published Capture #581, main `82df06813eacbd7fc3fbce351576e1d9759df225`. Fifteen publication paths: material route, EntryCard, MaterialItemCard and two focused tests; theme/materialDetail; two browser specs; this ledger, central delivery status and five library dictionaries removing only unused rename copy. No new route, contract, display string, library or production fixture.

## Final behavior and tokens

The shared header uses the existing localized Dein Material title and a 44 pt pencil rename action. The complete factual material title wraps in content with TYPE.title; subject/question count uses TYPE.meta. Actual 120-character names are not reduced to a truncated header. Existing rename/add-page/delete confirmation, polling/refetch/cache, busy guards and IDs remain intact.

MaterialItemCard retains full stems/letters, choices, shared QuestionFigure, topic/results and confirmed deletion. EntryCard retains actual data/navigation/icon/tint/children and uses CARD_PAD.base, TYPE.cell, TOUCH and shared icon/chevron geometry. MATERIAL_DETAIL centralizes bottomClearance 32 and choiceBadge 24; no additional title geometry is introduced. All published Capture, Chat, dark viewer and structured-form behavior is inherited.

## Verification

Fresh frozen install, mobile and strict two-spec TypeScript, scoped lint/format/diff pass. Nineteen focused tests across five files cover actual question stems/choices, figure accessibility, IDs/actions, reading/empty and cache. Mounted tests do not establish measured raster geometry. Four owned production files are byte-identical to the accepted earlier source.

Actual local API/PostgreSQL ordinary/add-page matrix passes 4/4 in 1.8 minutes on this published Capture base, across Pastell/Meer light/dark and both phones. It verifies saved questions, rename/reload, delete cancellation and deletion to empty, real gallery selection/JPEG upload, complete reservation request with completes equal to the original material ID, actual submit response and original material GET with returned questions. The displayed count derives from that response; the visible stem uses the established worksheet fixture. All 32 screenshots have strict fit, 44 pt targets and clean axe. Final proof: test-results/redesign-material-detail-preparation/82df-final. Earlier 227b proof and test-only /v1 predicate diagnostic remain separate.

The full 120-character rename/title matrix retains original Home df537 provenance: 4/4 in 1.5 minutes, 24 original/editor/long-title screenshots, actual save/reload and complete visible wrapping at both phones. Title/editor renderer bytes remain unchanged; this proof was not relabeled or gratuitously repeated. Its artifacts remain in final-title.

## Limits

Saved materials expose no source-photo retrieval contract, so no unsupported original-photo zoom is invented. The real worksheet fixture supplies multiple-choice fractions without extracted raster figures; shared figure compatibility is mounted-tested, not claimed as real browser raster proof. Native keyboard/image gestures/screen readers and observed in-flight native motion remain unverified. The initial fifteen-path commit passed normal hooks (760 related tests across 102 files, workspace typecheck/lint/guards and native exports) and full normal pre-push (5,214 tests across 515 files, one intentional API skip). PR #582 is draft pending the final delete-action correction.

The normal unused-text guard identified library.rename after its visible text action became the accessible pencil. Actual source has no remaining caller. Only that key is removed in all five dictionaries; rename_label and every editor label remain. Original guard failure is preserved; no dummy use or exception grant.

## Final delete action

The filled quiet delete pill must retain its shared side padding. Removing only bare keeps quiet/sm/pill and the original callback while restoring canonical Btn padding; no new token or controller. Earlier 82df-final screenshots are retained as before-fix evidence. The corrected ordinary/add-page four-appearance matrix passes 4/4 in 1.7 minutes with 32 clean fit/44 pt/axe PNGs in delete-padding-round2. Four existing MaterialItemCard tests and scoped lint/format/diff pass. Corrected-source normal gates remain pending review.
