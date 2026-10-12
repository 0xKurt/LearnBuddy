# Material detail — #548

Ready for review on published Capture #581, main `82df06813eacbd7fc3fbce351576e1d9759df225`. Fifteen publication paths: material route, EntryCard, MaterialItemCard and two focused tests; theme/materialDetail; two browser specs; this ledger, central delivery status and five library dictionaries removing only unused rename copy. No new route, contract, display string, library or production fixture.

## Final behavior and tokens

The shared header uses the existing localized Dein Material title and a 44 pt pencil rename action. The complete factual material title wraps in content with TYPE.title; subject/question count uses TYPE.meta. Actual 120-character names are not reduced to a truncated header. Existing rename/add-page/delete confirmation, polling/refetch/cache, busy guards and IDs remain intact.

MaterialItemCard retains full stems/letters, choices, shared QuestionFigure, topic/results and confirmed deletion. EntryCard retains actual data/navigation/icon/tint/children and uses CARD_PAD.base, TYPE.cell, TOUCH and shared icon/chevron geometry. MATERIAL_DETAIL centralizes bottomClearance 32 and choiceBadge 24; no additional title geometry is introduced. All published Capture, Chat, dark viewer and structured-form behavior is inherited.

## Verification

Fresh frozen install, mobile and strict two-spec TypeScript, scoped lint/format/diff pass. Nineteen focused tests across five files cover actual question stems/choices, figure accessibility, IDs/actions, reading/empty and cache. Mounted tests do not establish measured raster geometry. Four owned production files are byte-identical to the accepted earlier source.

Actual local API/PostgreSQL ordinary/add-page matrix passes 4/4 in 1.8 minutes on this published Capture base, across Pastell/Meer light/dark and both phones. It verifies saved questions, rename/reload, delete cancellation and deletion to empty, real gallery selection/JPEG upload, complete reservation request with completes equal to the original material ID, actual submit response and original material GET with returned questions. The displayed count derives from that response; the visible stem uses the established worksheet fixture. All 32 screenshots have strict fit, 44 pt targets and clean axe. Final proof: test-results/redesign-material-detail-preparation/82df-final. Earlier 227b proof and test-only /v1 predicate diagnostic remain separate.

The full 120-character rename/title matrix retains original Home df537 provenance: 4/4 in 1.5 minutes, 24 original/editor/long-title screenshots, actual save/reload and complete visible wrapping at both phones. Title/editor renderer bytes remain unchanged; this proof was not relabeled or gratuitously repeated. Its artifacts remain in final-title.

## Limits

Saved materials expose no source-photo retrieval contract, so no unsupported original-photo zoom is invented. The real worksheet fixture supplies multiple-choice fractions without extracted raster figures; shared figure compatibility is mounted-tested, not claimed as real browser raster proof. Native keyboard/image gestures/screen readers and observed in-flight native motion remain unverified. Normal publication gates are pending review; no commit or PR yet.

The normal unused-text guard identified library.rename after its visible text action became the accessible pencil. Actual source has no remaining caller. Only that key is removed in all five dictionaries; rename_label and every editor label remain. Original guard failure is preserved; no dummy use or exception grant.
