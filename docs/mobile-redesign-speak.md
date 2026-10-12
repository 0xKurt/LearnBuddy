# Speak — #548

Ready for review on published Drill main `5859c7ed3964a71fa23a7e2f5a2c0d1ff2140f84`. Eleven paths: SpeakPanel, WordSheet, ItemThread and its existing test; TYPE and new theme/speak; word-target and WordSheet lifetime tests; the actual Speak browser spec; this ledger and central delivery status. No pending source or helper copies.

## Final changes

Published QuestionCard keeps the actual sentence. TYPE.questionStrong derives question geometry and live Figtree700 for judged words. Wrapping PressArea words have a 44-point minimum and retain exact word-object callbacks/order, including repeated short words. Read-only feedback has no inactive controls. Pronunciation notes are plain full-width content; shared PRACTICE.speechNoteGap is reused, and SPEAK.statusHeight owns the existing status slot. Published BusyIndicator remains.

WordSheet owns attempt state in a private visible body keyed by session/item/language/word. Closing unmounts that body; existing useMounted prevents old success, error or finally from affecting a reopened panel or held new attempt. Close still calls the recorder's existing cancel. Audio/request payloads, grading, retry IDs, offline skip/discard, permission/settings and playback are unchanged. No recorder fence or general lifecycle hook was added.

ItemThread omits the decorative recording marker only for a committed graded pronunciation answer whose next tutor reply has the same item and feedback exactly matching the server's stored encoding. It displays factual heard text. Arbitrary learner-authored prefixes, tutor questions, pending input, essay/code rendering, turn IDs/measurements and stored/API data are preserved.

## Evidence and provenance

Meaningful mounted red proof found eight stale request results across word/session/item changes and same-word reopening; two held-new-attempt cases also failed before the lifetime fix. All fourteen lifetime cases pass, including legitimate current result, retry and unmount. The confirmed transcript test failed before its display fix while five authored/mismatched-mode cases passed. Original evidence: `/tmp/learnbuddy-wordsheet-lifetime-red.log`, `/tmp/learnbuddy-wordsheet-new-attempt-red.log`, `/tmp/learnbuddy-speak-transcript-red.log`.

Fresh restoration on 646b passed 46 tests across five files, frozen install, mobile and strict browser-spec typechecks, lint/format/diff. The final 5859 source preserves the accepted owned bytes; published 646b→5859 has no overlap. Fresh 5859 frozen install, mobile/spec typechecks, lint/format/diff and all 46 affected tests across five files pass. Integration logs use `/tmp/learnbuddy-speak-5859-*`. Normal publication gates are reported after execution.

Actual final four-appearance/two-phone proof remains on its preserved 706 source: Pastell light 1/1 in 44.5 seconds and the remaining three cases in 2.3 minutes. It verifies palettes/Figtree, wrapping/44 targets/strict fit/axe and live held-press reduction. Three genuine automatic upload aborts preserve identical full audio/ID payloads; visible error leads to a real manual retry. The actual AnswerResponse already finishes the session, and two selected-word recordings succeed with the same real session/item and valid schemas. Authenticated GET SessionView proves unchanged stored text without reloading feedback. Marker-free transcript is visible. The almost-only fixture does not establish normal completion or Again.

Durable proof: task `learnbuddy-redesign/speak/transcript-final/{pastell-light,remaining}`; logs `/tmp/learnbuddy-speak-transcript-first-canonical.log` and `/tmp/learnbuddy-speak-transcript-remaining.log`. Earlier retry/lifetime proof remains separately at `speak/final-706`. The one-abort test assumption, finished-word HTTP 409 repaired independently in #572, and CDP SSE decoding diagnostic are preserved externally; no fixture workaround, finish suppression or production mojibake fallback is added.

## Limits and delivery

Restorations inherit current RunResult, TYPE union, BusyIndicator and finished-word endpoint. No pending Rehearse RecordingStatus changes are copied. Native physical recording, permission flow, large-text geometry and OS motion need device verification. The original browser provenance is not relabeled as current native/runtime proof. Speak follows merged Drill; independent structured-answer keyboard repair #576 remains separate before Capture.
