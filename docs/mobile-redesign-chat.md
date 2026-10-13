# Chat redesign (#548)

Integrated on published Home main `df537c91145e60aad3e75b0149a0260663bed81c`. Reference: HANDOFF §6, Chat.jsx and Message.jsx; repository layout rules in docs/UX-PRINCIPLES.md. Dispatch, failure/resend/stop, receipts/undo, outreach, reading stages, material navigation, markdown, refresh and overlay callbacks retain their real controllers/contracts. One header Orb remains; Orb/moon internals are unchanged.

## Source and shared roles

Conversation uses primary/onPrimary learner bubbles and plain full-width Buddy text. AreaCard, ConfirmCard, NoticeBubble, OfferShell and DrillOfferCard use existing paper cards. SlimBar/TypingBubble show actual static status. RichText reuses published TYPE.bodyStrong. UndoSheet reuses Sheet/ListGroup/Row and secondary buttons. Each actual turn exposes one ghost Zurücknehmen trigger; choosing an action immediately invokes its existing ID callback. Carried-on-top actions remain available; returned undone rows remain visible, struck and muted with ink2. Default Row.title stays a string and its default appearance is unchanged.

HomeAct optionally delegates undo errors to the sheet while every other caller retains its existing toast. Home and History key errors to action IDs; stale unrelated errors are not shown. ErrorNote uses existing messageFor text, with no second ToastHost. History receives its existing Home contact flag.

Interactive TextLink has a real 44 pt box while plain text remains compact; default stretch and callbacks are preserved.

CHAT owns learner geometry (82%, padding 10/16, tail 6), card/receipt widths, reading/notice/overlay geometry, metadata, press states and reveal rate. Follow slack reuses SPACE.xl. UI.textLink owns pressed opacity; UI.entrance.staggerCap owns the existing four-position cap. SlimBar's divider reuses UI.border. Pure motionDurations owns existing DURATION values plus wordRevealLag; motion keeps its stable re-export. Later units must union their real duration roles into that published module rather than copy an old snapshot.

Changed components: buddy AreaCard, Composer, ConfirmCard, Conversation, HomeThread, NoticeBubble, RichText, SlimBar, TopOverlay, TypingBubble and useReveal; lb Motion/TextLink; learn DrillOfferCard/OfferShell. Shared algorithms: buddy reveal/useThreadFollow, homeLayout and theme components/motion. Additional parent/controller files: app buddy/history and buddy useHomeAct; shared Row has an optional completed presentation state. New modules: UndoSheet, theme chat/motionDurations. Total final scope: 47 files, including locales, tests and ledgers. Tests: existing Conversation, six focused component/hook regressions, core-loop model scenario/guard and redesign-chat browser matrix.

## Live motion and mount boundaries

Existing Appear/Rise helpers drive cancelable entrances: web retains fade-only geometry, native retains rise. AppearText preserves real native Text semantics; Composer stop uses DURATION.quick. A first-commit gate skips the initial subtree. The shared helper consumes an initially skipped mount, so existing history never replays on busy/callback rerenders; later-mounted descendants may enter. Optimistic-to-stored replacement does not replay. Optional neighbor layout glides and reply-pill exit fading are removed because running builder animations lack supported cross-platform cancellation. No new animation engine or DOM cancellation workaround is introduced.

useReveal cancels queued frames and displays only arrived text on live reduction. TopOverlay cancels/settles its finite motion, preserves identity and invokes the latest close callback once; an old canceled callback cannot dismiss replacement content. Active intentional thread follow settles at its requested end once when reduction changes; completed/manual reading remains untouched. Public drag/touch/wheel/navigation-key events interrupt tracking, excluding text entry and ordinary activation. Endpoint completion uses actual measured end, not the follow slack. No timer, document listener or second scroll engine is added.

Undo double-invocation and delegated error routing have controlled red-before-green regressions. The mounted immediate HomeAct rejection commits busy=true then false and retries correctly; a hypothesized no-busy-commit failure was not reproduced, so no speculative lifecycle fix was added.

## Verification

Frozen install, mobile/API typecheck and scoped lint pass. Focused mobile regression suite: 92/92 across 15 files, including the earlier 77 tests plus undo chooser/error/contact and mount-boundary additions; scripted-model guard: 7/7. Relevant logs: `/tmp/learnbuddy-chat-final-92-focused.log`, `/tmp/learnbuddy-chat-precommit-{mobile,api}-tsc.log`, `/tmp/learnbuddy-chat-precommit-lint.log`, `/tmp/learnbuddy-chat-text-fixture-tests.log`. Normal commit/push gate results are recorded when executed.

Red-before-green covers active end settlement, reveal cancellation, overlay identity and history replay. The same-history rerender fails before skipped mounts are consumed; the final test also verifies a later option enters, live reduction cancels/settles it, and turning motion back on does not replay it. Existing result/list/ItemThread callers use mount eligibility, not delayed prop-triggered entrances. Replay red log: `/tmp/learnbuddy-chat-history-replay-red.log`.

The real local API/PG Chat matrix covers Pastell/Meer light/dark at 360×740 and 390×844: keyboard undo, capture/ready/offer cards, Figtree and actual selected-family paint, strict clipping/44 pt/axe, material-focus navigation and return. The final sheet/card/navigation matrix passes 4/4 in 2.8 minutes with 64 PNGs (`chat/undo-final`). It aborts the first real undo transport, proves the modal error is visible, holds and forwards the genuine retry, verifies busy/disabled and one request despite repeated Enter, then confirms returned undone state. The background worksheet preparation remains goal-only. A separate exact learner request scopes practice to the real ready-sheet alias extracted from its current model STATE; the test captures the worksheet's real ID, checks returned home.focus.material_id, and navigates to that exact material. No database/API state is assigned or fabricated.

After the final two factual-text ink2 corrections, a narrow actual four-appearance/two-phone matrix passes 4/4 in 57.3 seconds with 16 PNGs (`chat/factual-text-final`). It disables contact through Settings, checks the real PATCH flag and reminder SSE home.system flag, then verifies the actual agreed reminder explanation and receipt typography/color/fit/axe. The fixture validates the production action schema, relative tomorrow day/time and exact learner quote; it writes no IDs/dates. Shared signUpMia still permits notifications by default.

## Durable runtime evidence and limits

Task visualization directory `learnbuddy-redesign/chat` contains external diagnostic scripts, JSON and logs:

- `live-scroll-diagnostic` / `live-scroll-after`: actual programmatic smooth follow continued before; after, one immediate end call settles at measured y496. No precise before media-event latency is claimed because that trace did not record the event separately.
- `active-entrance-first` / `active-entrance-after-corrected`: incoming Brüche offer continued fading approximately 204 ms after the actual reduced-media event before the change. After, opacity changed from 0.135 to 1 at the event and stayed settled. The first after observer incorrectly selected the static pending learner bubble; `active-entrance-after` is invalid diagnostic evidence, retained explicitly.
- `undo-first-contrast`: completed-row ink3 contrast failed; the final row uses the theme muted-text ink2 role. Decorative glyph ink3 remains.
- `factual-text-missing-contact`: the initial narrow fixture assumed contact-off despite default signup explicitly permitting it; the corrected proof changes contact through real Settings. Buddy flag wiring was already correct; no useSettings subscription was added.
- `matrix-focus-first`: initial matrix failure assumed automatic worksheet preparation established material focus. Its artifacts are retained; the corrected scenario exercises genuine sheet-scoped preparation instead.

Diagnostic specs are artifact-only and removed from discovery. Native runtime, physical voice/provider behavior and in-flight platform gesture cancellation remain unverified. Talk's analogous active-scroll work belongs to its later unit. These checks do not claim native compliance or a final whole-app walkthrough.

The later History unit must exercise the shared chooser, its keyed modal error and genuine failed retry/success on the actual History screen after this unit publishes. Current Chat runtime does not claim that separate screen proof. The 64-sheet/card images precede the final factual-text-only correction; the 16 narrow images prove those current text roles. Prior 32 PNGs in `matrix-before-undo-sheet` are provenance for the previous inline undo surface, not final sheet proof.

## Correction of 13 October (#599, area chat)

The audit of 12 October found the thread off the design; what this document says above about
these parts no longer holds:

- Buddy's lines stand beside his mini orb (`ThreadOrb`, 26 pt, the existing `BuddyOrb`): at the
  newest line only, older lines keep the column (`Message.jsx:17–19`). The typing status is the
  22 pt orb and three still dots (`Cards.jsx:96–103`), not a line of text.
- A receipt is `Chip tone="receipt"` under the line's text; "Zurücknehmen" is a quiet line
  (ink-2 600 14 with the undo sign, `Gaps.jsx:83–85`), no longer a ghost button. The undo sheet
  and its logic are unchanged.
- `NoticeBubble` is gone and `OfferShell` only serves `RehearseCard` until its group: every
  offer and every notice in the thread is `components/buddy/ChatCard.tsx` (`PracticeReady` /
  `ChatCard`, `PracticeReady.jsx`), full width, 16 inside.
- The ⋯ menu is one list of six places on every screen (`App.jsx:125–134`); the four ways to
  start moved into the start sheet "Was willst du üben?" (`Extra.jsx` `StartSheet`,
  `Modes.jsx` `ChoiceList`), which the chat's menu leads to.
