# Parent Profile form migration

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. Every page of the profile says "2 von 4". The way back from the parents' page is the quiet action under "Weiter" in the bar below; `SetupStep` has no `top` slot any more and nothing stands above Buddy (`ui_kits/app/Onboarding.jsx` `OnbPage`). The parents' page is the consent row, then the PIN block 12 apart with its fields 12 apart; `PROFILE.pinGap` is gone. The note for a learner under 16 is words on the page, not a lavender box. Margin 20.

Consent #555 is merged. This independent step replaces only the learner/parent form presentation in app/profile.tsx and BirthDateFields: raw inputs become Field, LanguageFlags becomes LanguageChoice, the parent card becomes a plain consent/PIN form, and the duplicate Screen/KeyboardSafe/ScrollView shell becomes onboarding SetupStep with one keyboard avoider and pinned actions.

Required name, region and birth date, adult consent/PIN/repeat, locale, drafts, age validation, digits-only filtering, focus handoff, announcements, errors, sign-out and stage callbacks remain intact. Contact, Voice and Handover presentations remain separate. No prototype-only count, notification decision, route, API or persistence change is introduced.

## Files and tokens

Owned files: app/profile.tsx; removed obsolete lb/LanguageFlags.tsx after its final caller migrated; auth/BirthDateFields.tsx and its regression test; auth/SetupStep.tsx and its existing tests; lb/PickerField.tsx and its native-label regression test; lib/theme/profile.ts; auth locale files in all five languages; tests/web/redesign-onboarding-matrix.ts and redesign-profile-parent.spec.ts; this ledger and the central delivery ledger.

PROFILE owns pinGap, shield (20 pt) and yearShare. PIN explanation uses merged TYPE.paragraph (16/23); supporting hints retain existing Meta roles. The unchanged bullet placeholder is auth.profile.pin_placeholder in all five languages. Existing i18n provides all other display text.

SetupStep's optional onboarding top slot is a leading row at the canonical 16 pt gutter; the legacy centered variant is unchanged. Profile uses canonical IconBtn with a 44 pt Back target. Later Contact integration must remove its extra top padding when opting into this shared slot. No pending source was copied between worktrees.

## Validation

Frozen install, workspace/mobile typechecks, scoped ESLint and diff checks pass. Thirty-one focused tests cover date filtering/focus/locked fields, date validation, the single keyboard avoider, leading top slot and legacy default, live Bold Text and frozen theme tokens.

Final real-stack picker matrix passes 4/4 (1.4 min) in Pastell/Meer light/dark at 390×844 and 360×740. It proves actual palette/Figtree, required region independent of invalid date, language selection, PIN mismatch, full field reachability inside effective scroll clips, footer inside viewport, leading Back 44 pt, and the same held normal press settling on live reduced motion before release outside. A 360×420 browser viewport proves reduced-height layout, not a native keyboard. Manager rendered review passed.

Artifacts: task artifact profile-parent/picker-final and /tmp/learnbuddy-profile-555-artifacts/picker-final; genuine pre-migration images are under profile-parent/before. Lifecycle/native evidence and normal gate results are recorded below when completed.

Shared background reconciliation remains a separate unit. Exact final creation/persistence belongs to Contact; this form step does not claim that transition alone proves a POST. Physical-device, native scroll and screen-reader verification remain open.

Existing lifecycle checks pass 6/6 (1.9 min): full parent setup through real creation/onboarding/Home, four non-German locale registrations and decline/sign-in/Profile exit. Interim Contact/Voice/Handover callers remain usable. Durable evidence is under profile-parent/lifecycle-final. This preserves the normal existing persistence path; the following Contact matrix owns exact payload assertions.

## Native review and picker correction

Manager iPhone 14 / iOS 26 review found the selected full-width region label severely shrunk on the native small-button auto-fit path. PickerField now uses the existing medium control size (48 pt), which permits two lines without automatic font fitting. The native Text-prop regression fails before the change and passes afterward; existing picker selection/required-value tests remain green. Browser matrix checks the long real region name at 16 pt and full target bounds on both phones. No underlying React Native root cause is claimed and other small auto-fit controls remain a final native-review risk.

Native rendered review confirms Niedersachsen and Mecklenburg-Vorpommern remain normal readable text with keyboard closed/open, parent explanation/fields/error remain readable, completing the first PIN focuses repeat, and mismatch blocks Next. Screenshots are under task native/profile-region-long-stable-ios26.png and profile-region-long-keyboard-ios26.png. The Year field's outer focus ring/border meets the scroll clip edge while the inner input remains visible; this narrow cosmetic limitation is assigned a separate shared-focus review. Native scroll gestures, physical-device and screen-reader verification remain open. No auth/provisioning/native source changed.
