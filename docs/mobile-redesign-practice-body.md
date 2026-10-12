# Ordinary Practice conversation

This unit follows `ui_kits/app/Practice.jsx` and the original Composer contract. Ordinary typed and plain-choice tasks share one scrolling body containing the full question, answers and feedback. The existing pinned CheckBar owns shortcut Chips above the Composer. Structured boards, figure choices, speaking, dictation and code keep their existing measured layout and answer contracts.

The source is based on published main `2b314156`. QuestionCard #594 and Option #592 are actual published dependencies. PhotoReview #595 is independent. No pending source was copied.

## Shared presentation and behavior

`PRACTICE.ordinaryBody` owns body top 18, content gap 10, bottom space 16, feedback gap 14 and feedback top 6. The optional ItemThread gap uses the same value for layout and measured turn positions; its default remains unchanged. Chip forwards an existing accessibility hint.

The existing `useThreadFollow` preserves Home's default policy. Ordinary Practice starts at the question. Learner intent uses its existing end-follow owner; reasons and long replies use a keyed read-from-start intent. Reading cancels active and queued end-follow movements. Manual input cancels a pending read. Reexplain keeps one existing draft/state/check owner; only shortcuts move to the pinned presentation slot.

The explicit `scroll-practice-body` fit integration allows unfocused content to scroll. Focused frames and all structured-board/IME assertions remain strict. The browser scenario visits every ordinary option and reason through actual scrolling, including the outside focus ring.

## Verification

Current focused checks: 47 tests across seven suites, mobile TypeScript, strict browser-spec TypeScript and scoped lint pass. Causal failures and fixes cover initial top, queued end intent replacing a read intent, the real pinned action slot and default-controller preservation. Actual browser verification passes four appearances (Pastell and Meer, light/dark), both 360×740 and 390×844 phones, with 80 preserved PNGs. The first case passed in 45.9 s; the remaining three passed in 2.4 min. It proves actual grading, a locked single Why POST, all option/reason whole-frame reachability, long explanation start before test scroll assistance and subsequent end reachability, plus typed open→correct→closed feedback. Strict fit, targets and axe remain active. No whole-screen or native acceptance is claimed here.

The first real Pastell run reached Why after three actual wrong attempts. Its focus-scroll diagnostic recorded the second reason border at 548–610, body viewport at 60–610, a 3 px ring, scrollTop 441 and maximum scrollTop 529. The remaining 88 px scroll room shows this was browser border alignment, not missing production geometry. A genuine wheel gesture makes the entire frame reachable. The separate old fixed-board tile assertion was adapted only for this explicit scrolling body; all originals are preserved externally. A causal long-reply failure also showed that the main-thread offset cannot describe turnsAgain. Reexplain now supplies its own measured tutor start and ID through the existing presentation slot; the mounted regression verifies pending and newest-tutor identity.

The full pre-push gate also found an obsolete file-wide single-CheckBar declaration count. Its replacement still requires exactly one CheckBar in each mutually exclusive layout and verifies early delegation; mounted ordinary and measured tests each require one actual BottomBar. Single-input, no-nesting and explicit own-bar guards remain unchanged. This is a test-only correction; rendered source and browser evidence are unchanged.

## Design matrix and remaining criteria

Bounded rows: `screen:practice:choice-empty`, `screen:practice:choice-picked`, `screen:practice:retry`, `screen:practice:solution`, `screen:practice:help`, `screen:practice:typed-empty`, `screen:practice:typed-ready`, `screen:practice:correct`, `screen:practice:next`, `component:Composer:chips` and `component:Composer:check`. No default Practice row is promoted by this component/composition unit.

Root independently reviewed the Pastell reason-choice, long-answer/keyboard and closed typed-feedback renders against the original Practice source; Root also independently reviewed Meer-dark reasons at 390 and closed typed feedback with keyboard at 360; the bounded source and rendered composition are accepted. Native IME, native gesture scrolling and native screen-reader behavior remain open. Additional palette families and the whole Practice screen remain outside this bounded proof. Other original Practice variants and the remaining foundation roles are separate audit units.
