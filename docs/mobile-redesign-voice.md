# Voice onboarding and shared picker

> **Changed by #599 (onboarding area).** This ledger describes the state of #548. The step says "3 von 4", and the orb speaks while a sample is being read (`useBuddyVoice`), as the design shows the page (`ui_kits/app/Onboarding.jsx:103`). The tiles themselves are unchanged.

Integrated on published main `ff84060040e997149e608210e40932706980911a`, including Contact #557 and isolated database fixture fix #559. VoiceStep uses the left-aligned onboarding shell and one pinned Continue action. The shared picker presents the six actual voices in three columns, with a full-width named radio above a separate preview/stop target. Each target is at least 44 pt; descriptions remain visible beneath the tiles. Selected tiles use the active primaryLt surface and primary frame.

## Files and tokens

- `app/profile.tsx`: only VoiceStep changes; learner/parent forms, Contact, Handover, availability and callbacks remain intact.
- `components/lb/VoiceOption.tsx`: pure controlled tile with independent selection and preview actions, translated descriptions and accessibility hints.
- `components/voice/VoicePicker.tsx` and its existing tests: reuse all six canonical IDs and preserve versioned PATCH, in-flight lock, optimistic rollback/stale invalidation, sample override/stop and unmount cancellation. Selection plays nothing; preview selects nothing.
- `lib/theme/voicePicker.ts`: central row basis, spacing and minimum height derived from two target, padding and gap roles (104 pt). The named radio receives the whole tile width; fonts are not shrunk.
- `lib/theme/type.ts`: adds live `TYPE.voiceChoice` (15/20, Figtree 600), preserving all merged roles and Bold Text behavior.
- `locales/fr/auth.json`: preserves existing words while binding Buddy and its question mark with a nonbreaking space.
- `tests/web/redesign-onboarding-matrix.ts`: optional localized primary-action label; default assertions remain intact.
- `tests/web/redesign-voice-onboarding.spec.ts`: actual local setup, speech and persistence verification.

Existing SetupStep, IconBtn, translations, speech/settings adapters and theme primitives are reused. No new dependency, route, domain payload, artificial voice group or sample name is introduced. Settings-Voice will reuse this genuine component. Merged BusyIndicator/UI.busyIndicator and Icon ColorValue are retained unchanged.

## Evidence and limits

Five actual fake-speech browser cases passed in 1.2 min: four German appearances plus French, both 360×740 and 390×844. They verify actual palette/Figtree, whole Freundlich/Chaleureuse bounds, six names/descriptions, independent 44 pt targets, held preview then live reduced-motion settling, both actual localized sentence responses, no speech from selection, exactly one selection PATCH, authenticated GET persistence and Continue. Strict fit and axe pass. Final images are under task `learnbuddy-redesign/voice/final-main556/results/shots`; complete artifacts are `/tmp/learnbuddy-voice-main556-proof-artifacts`.

The final French heading passed a fresh 1/1 case (15.9 s); both phone images preserve the full heading without orphan punctuation. Artifacts are under task `learnbuddy-redesign/voice/french-punctuation-final/results/shots`. Existing i18n parity passes 11/11. The height derivation retains evaluated geometry; nine existing VoicePicker/frozen-token tests, mobile typecheck, scoped lint and diff checks pass after that cleanup. Logs: `/tmp/learnbuddy-voice-token-{tsc,lint,tests}.log`.

The Contact rebase applies only this unit's scoped changes and introduces no visual or speech-contract changes to the accepted browser build. Frozen installation, workspace checks and the normal commit gate pass, including 673 related tests in 85 files, engineering guards, iOS/Android exports and shipped licences. Final normal full-suite publication results are recorded in the PR. Silent-provider playback proves adapter/UI behavior, not physical sound. Native Voice, OS Bold Text and physical speech remain unverified; native services and device control stay unchanged.
