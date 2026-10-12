# Photo quality review fidelity (#589, #548)

Original `ui_kits/app/Capture.jsx:40–48 (title 42, detail 43)` defines a 16/22/700 title, 15/22/400 ink2 detail and 10-point gap. PhotoCheckCard now uses live TYPE.reviewTitle and TYPE.reviewDetail with CAPTURE.reviewGap. The sunken canvas card retains canonical CARD_PAD.base 16 from the user-authorized space.ts. Actual quality strings, photo index/problems, announcement, disabled state and retake/keep callbacks are preserved.

Six preparation paths: PhotoCheckCard, theme/type, theme/capture, its mounted callback test, redesign-photo-review browser spec and this ledger. The three new presentation roles are centrally defined; no controller, strings or domain contract changed. The same registered view remains shared by Capture and WorkPhotoNote.

Source base is actual published Capture #593, 3fd169b5b06e649031c9cfdcdcadf77cfe52f922. Only this unit's six paths were restored from immutable stash d7883fa2d9142eb5e7fe3bbca2c13adaba7329e8; no pending modules were copied. Later TYPE integration must preserve QuestionCard's independent questionFeedback role.

Validation: 10 focused tests in three files, mobile typecheck, strict browser-spec typecheck and scoped lint passed. Four real API/PG appearance cases passed: Pastell light 1/1 (14.7 seconds), then Pastell dark and Meer light/dark 3/3 (30.4 seconds), using both 390 and 360 phone widths. Each case exercises genuine blurry-photo Keep, removal and Retake with a clear replacement. Keeping preserves the factual “Schwer lesbar” image label; successful retake removes it. The initial clean-label expectation after Keep was a test defect; its failure/context/source identity are preserved separately.

Final proof contains 16 PNGs under test-results/redesign-photo-review-preparation/final and the task visualization photo-review/final directory. Both runs use the same exported production bundle identity, recorded in source-id. Physical camera, native large text and screen-reader behavior remain unverified. Header and Row fidelity belong to their separate correction units; this evidence verifies the bounded quality-card flow rather than whole Capture compliance.
