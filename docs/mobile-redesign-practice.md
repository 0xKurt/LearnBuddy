# Practice presentation migration

Step 4 follows the supplied Option and QuestionCard contracts. Selection is a draft;
checking is the separate Composer action. Existing answer payloads and spoken routes
remain the domain adapter's responsibility.

## Prepared components

- `components/lb/Option.tsx`: paper option, letter/verdict mark, idle/selected/correct/wrong/dim
  states, radio or checkbox semantics, 56-point minimum visual height and locked-state handling.
- `components/lb/QuestionCard.tsx`: paper card with meta/content/figure/extra slots and compact/big
  presentation. No question/session logic.
- `lib/theme/practice.ts`: option geometry, state colors and question-card spacing.
- `components/practice/ChoiceList.tsx`: renders Option while preserving choice order, math,
  code indentation, figure zoom, server verdict words and select-all behavior.
- `components/practice/ChoiceAnswer.tsx`: saves a separate choice-index draft and checks the
  current original choice; changing selection never submits or overwrites the tutor field.
- `components/practice/CodeLineAnswer.tsx`: saves a line-index draft; Check sends the existing
  one-based line number and translated line description.
- `components/lb/PressArea.tsx`: forwards explicit `aria-checked`, required by React Native web
  even when native `accessibilityState.checked` is supplied.

- `components/practice/FractionBarAnswer.tsx`: comparing bars selects through the existing
  fraction draft and checks separately; the segment drawing is reused.
- `components/practice/DictationCard.tsx` and `SpeakPanel.tsx`: paper QuestionCard adapters;
  existing playback, recording, retry and feedback routes remain in their domain components.
- Order/Table/Fraction/Staff/Writing/Column/Mark/Grid geometry and icon sizes now read the
  practice theme rather than component-local visual numbers.

## Verification

Focused Option and ChoiceAnswer component checks cover selecting without submitting,
checking the exact current index/text, remount restoration, busy state and rejection of a
previously tried choice. Native accessibility state and explicit web checked state are both
supplied. Existing browser walks must add Check after a single-choice selection.

## Integrated layout and adapters

Theme #549, base #550 and Header/Composer #551 are merged. Practice now renders
QuestionCard → answer → tutor feedback → free room → help/tools → pinned Composer.
AnswerShell owns this sequence; the screen supplies thread/tool slots and preserves the
existing measured thread follow behavior. Empty threads reset measured reservations. Open regular choice drafts use the existing
compact source-text share. Optional help/tool chips fold only while a typed answer is focused
in tight keyboard room, including plain fields without a board; blur or keyboard close
restores them with drafts and callbacks intact. Source/prompt text and 44-point keys stay whole.

AnswerArea keeps original answer payloads, retries and voice routes. CheckBar gives a ready
selection the same central primary slot as the idle microphone; recording retains central
Stop and a quiet Check. A synchronous submission gate cancels voice and rejects late spoken
results after Check or keyboard exit, then unlocks for retry. CheckOverride lets a selected
Reexplain reason temporarily replace Next in the existing Composer, preserving the exact
reason index and failed-request draft; cleanup restores Next without a second bar.

AnswerTile is removed after its final caller migrated to Option. All answer forms now use
practice board skins and semantic TYPE roles. QuestionCard uses CARD_PAD.base/snug and
canonical radii. The palette carries no onSuccess/onDanger keys: nothing used them (#599 R4).
HelpChips use shared Chip states and motion tokens. Code uses the existing CodeBlock renderer:
normal closed questions show the whole program; keyboard density reuses ZoomableFigure's
collapsed affordance and viewer. Horizontal code scrolling is keyboard focusable.

New theme roles: option/board/table/speech/mark/music/drill/question typography; shared
practice geometry and tile/picked/placed/slot/correct/wrong skins. PressArea preserves
explicit web checked semantics and native accessibility actions; TapSurface is unchanged.
Source ownership and browser fit guards enforce answer-under-question.

## Syllable touch and accessibility

Syllables are marked as before the redesign (#599 R3, `docs/architecture.md` §Practice): one
word per row, each letter but the last a `<Btn bare>` with `checked`, 44 points high and one
30-point letter cell wide, the cells touching. A tap sets the cut after that letter, a second
tap takes it back; the answer is `cutId(wordIndex, letter)`. The single adjustable word
surface with arrow-key and accessibility-action stepping, and its seven `practice:mark.*`
strings, are removed: the design shows no such interaction (`components/practice/Answers.jsx`
MarkText). Device testing of VoiceOver/TalkBack is still required.

## Compact line-board adaptation

Regular choices retain the reference's 56-point Option. Code and FindError lines use the
shared compact button/radio board instead: at least 44 points per target, a plain number
column, and a tighter theme gap. Eight 56-point code options plus gaps would exceed the
360×740 screen before the question and Composer. Keeping compact rows preserves
`CODE_PICK_LINES_MAX = 8` and the original line numbers/indentation without lowering the
contract or adding a new drawing. Shared tile/picked skins preserve the same states across all forms. The eight-line maximum
is exercised through the real local browser harness, with ancestor clipping guards.

The test-only `Acht Codezeilen` scenario runs eight Python lines and fails on line eight.
A focused real-Postgres integration check verifies all eight generated lines, rejects line
seven and accepts line eight through sandbox grading. `tests/web/redesign-practice.spec.ts`
uses this same local scenario for draft restoration, no submission on selection, phone target
geometry, screenshots and the unchanged `text: '8'` Check payload. The final four-look browser matrix passes through the fresh local export.

## Final source scope

Production changes include `app/practice/[id].tsx`; lb Option/QuestionCard/Btn/PressArea/
TapSurface; practice AnswerArea/AnswerShell/CheckBar/CheckOverride/ChoiceAnswer/ChoiceList/
CodeLineAnswer/FractionBarAnswer/Reexplain/QuestionThread/ThreadBox/HelpChips/Question/
ItemCard/QuestionFigure/CodeBlock; and voice VoiceRow plus math ZoomableFigure.
Presentation migrations cover ClozeAnswer, ColumnAnswer, DictationCard, DrillRound,
EssayFeedback, GridAnswer, HeardTextCard, MarkAnswer, MatchAnswer, OrderAnswer, PassagePanel,
SelectAllAnswer, SolutionCard, SpeakPanel, StaffAnswer/StaffKeys, TableAnswer, WordSheet and
WritingSheet. Shared changes are practice geometry/visuals, screenRoom, theme practice/type/
palettes/motion, and the five practice locale files. AnswerShellTools tests cover focused typing, blur,
keyboard-close restoration and retained choice tools. CLAUDE rule 19 and UX principles now
state the authorized placement. Browser helpers use radio selection followed by Check.
The API change is only the deterministic maximum-eight-line local testing scenario and test.

## Remaining screen work

The separate Practice-screen step owns Verdict/Thinking, StimulusImage/ZoomViewer live
motion and the duplicated feedback BuddyOrb while the header Orb is present. Existing figure
renderers, domain maxima and Orb/moon choreography remain intact. Physical microphone,
VoiceOver/TalkBack and native OS preference changes still require device evidence.

## Completed validation

`redesign-practice.spec.ts`: 4/4 cases pass (3.2 minutes), using actual Settings Pastell/ocean
light/dark selections and computed primary colors. Across 360×740 and 390×844 plus keyboard
states: 72 durable screenshots, 84 fit reports and 28 clean accessibility stops. It covers all
eight code targets and selected/restored drafts, unchanged line-eight Check payload, full closed
program, keyboard folding, regular options, central spoken Check, wrong-answer retry and full
wrapped verdict words. The regular `correct` screenshot records the existing voice auto-advance
after correct Check; it does not claim a retained closed regular Option state. Nonvoice code
closed and the separate core-loop practice walk provide retained closed-question evidence.

Focused checks: 92 answer-form/ownership tests, 19 final ChoiceList tests, 12 CheckBar/voice
gate tests, four Reexplain override tests and all-eight-look contrast checks pass. Mobile
TypeScript and ESLint pass; the maximum-code real-Postgres integration check passes. Representative help and core-loop practice each pass 1/1. The affected material table/chart/
long-source walk passes1/1 after measured source-share and narrow keyboard chip folding fixes;
12 saved shots, 12 fit reports and four clean accessibility stops are in `practice/material-fit`.
Two focused AnswerShellTools tests additionally preserve drafts/help callbacks through focus,
blur and keyboard-close restoration. Representative code/talk/routes cases pass; the corrected picture-choice/reexplain walk
passes 1/1 and diagrams pass 1/1. All original verdict assertions remain. Normal repository
commit hooks are the remaining gate. This step changes 92 files including tests/docs.

Durable matrix: `learnbuddy-redesign/practice/final-matrix/` in the task visualization directory.
Log: `/tmp/learnbuddy-practice-matrix-final2.log`. Physical native behavior remains unverified.
