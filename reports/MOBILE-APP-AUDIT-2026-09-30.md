# LearnBuddy — Mobile App Audit

**Platform:** iOS + Android (one Expo codebase; a react-native-web build exists for the walkthrough tests)
**Framework:** Expo SDK 54 · React Native 0.81 · expo-router 6 · React 19 · TanStack Query · Zustand
**App type:** Consumer learning companion for learners ~12–18, **used by minors** (GDPR Art. 8 / KDSG relevant), no payments, no advertising, no third-party tracking
**Audited at:** commit `9ad15ae` on `main`, 2026-09-30
**Method:** static read of `apps/mobile` (21 screens, 108 components/lib modules) against the mobile-app-audit standard (universal · feedback/errors · advanced · iOS HIG · Material 3), plus the API paths the app depends on (`apps/api/src/modules/identity`, `src/auth`), the build config (`app.json`, `app.config.ts`, `eas.json`, `.env.example`) and the test harness. `pnpm typecheck`, `pnpm lint` and `pnpm test` were run (all green: 623 mobile tests). Nothing was verified on a physical device in this pass.

---

## TL;DR

LearnBuddy is a chat-first learning companion: one calm screen, Buddy in front, everything else behind tools. The implementation quality is unusually high for a pre-launch app — a single design system with palette tokens, one shared component per pattern, screen-reader announcements on every state change, an answer outbox that survives app kills, an offline banner with paused queries, on-device photo downscaling and quality checks, a parents' PIN enforced **server-side**, and automated checks that most shipped apps do not have (axe-core at every walkthrough stop, a "fits a 360×740 phone" gate, five-language key parity). Nine of the audit's domains are genuinely 🟢.

The gap is not in the app's code — it is at the **edges where the app meets the stores and the outside world**:

1. **🔴 The production build carries no configuration.** `eas.json`'s `production` profile has no `env` block at all and `preview` sets only API/Supabase. Consequence chain: no `EXPO_PUBLIC_PRIVACY_URL` → the consent screen's "Datenschutzhinweise lesen" button and the Settings → Über rows **do not render** → an app used by children would go to review without an in-app privacy policy or a support contact, and `lib/env.ts` will refuse to start a release build that is missing the API/Supabase values.
2. **🟠 A password change does not end the other sessions.** `apps/api/src/auth/verifier.ts:141` uses `auth.admin.updateUserById`, which leaves existing refresh tokens valid — in a family app the usual reason to change the password is that someone else knows it, and their device stays signed in.
3. **🟠 The confirmation e-mail is a dead end.** If the mail is lost or filtered, there is no resend anywhere in the app, the address is not echoed back, and the sign-in error "Bitte bestätige zuerst deine E-Mail-Adresse" offers no way out.

---

## Score Overview

| #   | Domain                                       | Score | Top issue                                                                                            |
| --- | -------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| 1   | Feedback components & error messages         | 🟢    | Toast is one slot, no action button, fixed 4.5 s                                                     |
| 2   | Loading, empty & offline states              | 🟢    | — (skeletons, delayed spinner, designed empties, offline banner)                                     |
| 3   | Authentication & account flows               | 🟡    | No resend for the confirmation mail; password change keeps other sessions                            |
| 4   | Onboarding                                   | 🟡    | Profile/parent step lives in memory only — an OS kill restarts the form                              |
| 5   | Keyboard & input behaviour                   | 🟢    | `keyboardAppearance` never set (light keyboard on the Nacht palette)                                 |
| 6   | Forms & data entry                           | 🟢    | No clear (×) button; no counter near the 2000-char composer cap                                      |
| 7   | Navigation & flow completeness               | 🟢    | — (no dead ends found; `+not-found` redirects to the gate)                                           |
| 8   | Feedback & affordances                       | 🟡    | `CircleBtn` (back/close/+/mic) has no pressed state                                                  |
| 9   | Permissions                                  | 🟢    | — (asked in context, `canAskAgain` handled, Settings deep link everywhere)                           |
| 10  | Notifications                                | 🟡    | Android small-icon not configured → white blob in the status bar                                     |
| 11  | Accessibility                                | 🟢    | Bold Text / Reduce Transparency not consulted; device SR pass still open                             |
| 12  | Privacy & security (baseline)                | 🟢    | — (HTTPS gate in `env.ts`, scrubbed crash seam, no PII in logs)                                      |
| 13  | App lifecycle & state                        | 🟢    | — (focusManager wired, camera result recovery, admin token auto-clear)                               |
| 14  | Credential storage & token security          | 🟡    | SecureStore left at the default accessibility (backup-restorable, unreadable when locked)            |
| 15  | Age verification, minors & parental controls | 🟢    | Exemplary — server-enforced PIN, own consent at 16, no counts shown to learners                      |
| 16  | In-app purchases & subscriptions             | —     | N/A (no monetisation)                                                                                |
| 17  | Performance & responsiveness                 | 🟢    | Device-side numbers not yet captured for the current build                                           |
| 18  | Internationalization & localization          | 🟢    | English is hardwired to `en-GB` date/number formats                                                  |
| 19  | Analytics, instrumentation & crash reporting | 🟡    | Sentry seam complete but **no DSN in any build profile** → zero crash visibility                     |
| 20  | Customer support & in-app help               | 🟡    | Support row only renders if `EXPO_PUBLIC_SUPPORT_EMAIL` is set (it isn't); no diagnostics pre-filled |
| 21  | App rating & review prompts                  | —     | N/A pre-launch (note the native-API rule for later)                                                  |
| 22  | Search UX                                    | —     | N/A (no search surface; the conversation is the entry point)                                         |
| 23  | Advanced security (pinning, attestation)     | 🟢    | Not required for this risk class; documented decision instead of cargo cult                          |
| 24  | What's New & feature introduction            | 🔵    | Nothing tells returning learners what changed after an update                                        |
| 25  | App updates & data migration                 | 🟡    | 426 force-update path is solid; no soft update, iOS store id still missing                           |
| 26  | Accessibility extended                       | 🟡    | Reduce Motion is handled everywhere; Bold Text / Reduce Transparency are not                         |
| 27  | Physical keyboard & shortcuts                | —     | N/A (portrait phone, `supportsTablet: false`)                                                        |
| 28  | Rich notifications                           | 🟢    | Categories + lock-screen actions + background task done properly                                     |
| 29  | App shortcuts & system integration           | 🔵    | Share-into-app works; no App Intents / home-screen quick actions                                     |
| 30  | Deep linking                                 | 🟡    | Universal Links / App Links declared for `learnbuddy.app` with no association files anywhere         |
| 31  | Media & camera                               | 🟢    | — (1600 px / JPEG 0.7, on-device quality check, PDF limits, resume after OS kill)                    |
| 32  | Background processing & long operations      | 🟢    | — (push action task, progress per page, cancellable sends)                                           |
| 33  | Offline-first & data sync                    | 🟢    | Exemplary — outbox, replay by `client_turn_id`, walkthrough-tested                                   |
| 34  | Clipboard, sharing & export                  | 🟢    | — ("Kopiert" toast, account export endpoint)                                                         |
| 35  | Scroll behaviour & edge cases                | 🟢    | — (`tests/web/fit.ts` fails the build when a screen needs scrolling)                                 |
| 36  | Platform conventions (HIG / M3)              | 🟡    | `userInterfaceStyle: "light"` forces native UI light while the app can be dark                       |
| 37  | Design consistency                           | 🟢    | — (tokens only, `frozen-colors` test, one component per action)                                      |
| 38  | Store readiness                              | 🔴    | Production profile unconfigured → no privacy link, no support, no crash reports                      |

---

## Findings by Domain

### Store Readiness — 🔴 Critical

**Overview:** Everything the stores ask for exists in the code and is switched off by configuration. This is the one domain that can stop a submission.

#### 🔴 A release build has no configuration at all

- **Where:** `apps/mobile/eas.json` (`build.production` has only `channel` + `autoIncrement`; `build.preview` sets 3 of 7 variables), consumed by `apps/mobile/lib/env.ts`
- **Problem:** `lib/env.ts` throws on start when `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing in a release build — correct behaviour (better than silently talking to localhost), but it means `eas build --profile production` yields an app that refuses to launch unless those values come from EAS environment variables set outside this repo. The four optional variables have quieter consequences: `PRIVACY_URL` empty hides the consent screen's policy button _and_ the Settings → Über row (`lib/about.ts` deliberately renders nothing rather than a placeholder), `SUPPORT_EMAIL` empty hides the support row, `IMPRINT_URL` empty hides the Impressum (required in DE), `SENTRY_DSN` empty means no crash reporting.
- **Fix:** Add an `env` block to `preview` **and** `production` in `eas.json` (or define the same keys as EAS environment variables for both environments and record where): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_IMPRINT_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_SENTRY_DSN` (EU host), plus build-time `SENTRY_ORG`/`SENTRY_PROJECT` and the `SENTRY_AUTH_TOKEN` secret for source maps. Then add one line to the release checklist: _install the built app and open Settings → Über — if the privacy row is missing, the build is not submittable._

#### 🟡 Small store items still open

- **Where:** `apps/mobile/app.json`
- **Problem/Fix:**
  - `ios.infoPlist.ITSAppUsesNonExemptEncryption` is not declared → App Store Connect asks the export-compliance question by hand on every upload. Add `"ITSAppUsesNonExemptEncryption": false`.
  - No iOS 18 dark/tinted icon variants. `ios.icon` accepts `{ "light": …, "dark": …, "tinted": … }`; the current single 1024×1024 opaque PNG is correct but will be auto-tinted.
  - `extra.appStoreId` is still absent, and `app/update.tsx` correctly hides its button because of it — fill it in with the first App Store record so the force-update screen has somewhere to send people.
  - Before submitting, dump the merged `AndroidManifest.xml` / `Info.plist` from a real build and confirm no permission is declared that the app never uses (plugins add `RECORD_AUDIO`, `POST_NOTIFICATIONS`, camera; `android.permissions` itself lists only `CAMERA`).

---

### Authentication & Account Flows — 🟡 Needs work

**Overview:** `app/welcome.tsx` is a model sign-in screen: two independent password reveals, `textContentType`/`autoComplete` per mode, return-key chaining, in-flight lock with spinner, inline field errors plus a persistent failure line above the pinned CTA, "why is this button waiting?" on a disabled tap, and a reset flow that never reveals whether an address exists. The PIN gate has real lockout handling with an unlock time. Two things are missing, and both are recovery paths.

#### 🟠 No way to get the confirmation e-mail again

- **Where:** `app/welcome.tsx:112–118` (`confirmSent` card), `locales/*/auth.json` (`welcome.confirm_*`, `error.email_not_confirmed`)
- **Problem:** After sign-up without an immediate session the app shows "Fast geschafft — Wir haben dir eine E-Mail geschickt", switches to sign-in, and stops there. The address used is not echoed, there is no "check your spam" line, no "wrong address? go back", and **no resend** — not in the card and not next to the sign-in error "Bitte bestätige zuerst deine E-Mail-Adresse". Supabase confirmation links expire; a mail that lands in a parent's spam filter therefore locks the family out of their own new account with no in-app path forward. (Grep confirms the only "Nochmal senden" in the app is for chat messages and speak recordings.)
- **Fix:** In the `confirmSent` card: show the address (`welcome.confirm_body` with `{{email}}`), add "Schau auch im Spam-Ordner." and a `<Btn variant="ghost">Mail nochmal schicken</Btn>` calling `supabase.auth.resend({ type: 'signup', email })` with a 60 s cooldown (reuse the `resetSent`/`resetBusy` shape already in this file), and a ghost "Andere E-Mail-Adresse" that clears the card. Render the same resend button when `AuthFailure.reason === 'email_not_confirmed'` at sign-in.

#### 🟠 Changing the password leaves every other device signed in

- **Where:** `apps/api/src/auth/verifier.ts:141` (`updatePassword` → `auth.admin.updateUserById`), route `apps/api/src/modules/identity/routes.ts:409`
- **Problem:** The admin API changes the password without touching existing sessions, and nothing in the codebase revokes refresh tokens afterwards (no `signOut`/revoke call exists in `apps/api/src/auth` or `modules/identity`). A parent who changes the password _because_ the child, a sibling or a classmate knows it achieves nothing on those devices: their refresh tokens keep minting access tokens. The same route also requires no current-password re-entry for an adult learner (a minor's profile is protected by the server-checked parents' PIN) — so an unlocked phone is enough to take over the login.
- **Fix:** After a successful `updatePassword`, revoke the other sessions: take the caller's bearer JWT from the request and call `auth.admin.signOut(jwt, 'others')` (scope `'global'` when the change came through the parents' PIN — then the phone in hand signs in again too, which is the safer default for a minor's account). Then tell the user: "Andere Geräte müssen sich neu anmelden." For adults, require the current password (Supabase's `reauthentication` or a `signInWithPassword` round-trip) before the change — the `reauth_needed` copy already exists in `locales/*/auth.json`.

#### 🔵 Smaller auth items

- No password-strength meter or checklist — just "Mindestens 8 Zeichen." (`welcome.password_hint`) with the server's own weak-password refusal as backstop. Acceptable for this audience; a three-step strength bar under the field would still help the adult who creates the account.
- No "log out of all devices" and no session list in the adults' area. With revocation added (above) a single "Von allen Geräten abmelden" row in `AccountAccessCard` would round it off.
- No biometric unlock. Deliberate and right for a shared family phone — the PIN gate guards what needs guarding.

---

### Credential Storage & Token Security — 🟡 Needs work

#### 🟡 Keychain/Keystore accessibility left at the library default

- **Where:** `apps/mobile/lib/auth/session.ts:33–37` (`SecureStore.setItemAsync(key, value)` with no options), read again from the background task in `lib/pushTask.ts:27`
- **Problem:** Two consequences at once. (a) Without `..._THIS_DEVICE_ONLY` the items are part of an encrypted device backup and can be restored onto a different device together with a valid refresh token. (b) With the default `WHEN_UNLOCKED`, the notification-action task that runs from the **lock screen** ("Heute nicht", "Seltener schreiben") cannot read the session at all — the press is kept and flushed later, so it degrades gracefully, but the lock-screen feature silently never completes while the phone is locked.
- **Fix:** One option object fixes both: `await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })` for all five keys (and the local-owner key). After-first-unlock keeps the background task working; this-device-only keeps the tokens out of a restored backup.
- **Good as it stands:** tokens never in AsyncStorage, `persistSession: false` on the Supabase client so the library keeps no second copy, explicit deletion of every key on sign-out, refresh-token exchange that distinguishes a definite "no" from an outage with backoff (`lib/auth/refresh.ts`) and never turns a network problem into a sign-out, and the web's `localStorage` path fenced to development/browser tests with a comment saying so.

---

### Notifications — 🟡 Needs work

#### 🟡 The Android status-bar icon is not configured

- **Where:** `apps/mobile/app.json` → `plugins` → `["expo-notifications", { "color": "#6a48d7" }]`
- **Problem:** `color` is set, `icon` is not. Without it Android falls back to the launcher icon and renders it as a flat white silhouette — for a full-colour orb icon that is an unrecognisable blob in the status bar and in the tray. This is the single most visible notification defect on Android and it only shows on a real device.
- **Fix:** Add a 96×96 PNG, pure white on transparent (the orb outline or the monochrome mark already used for `adaptive-monochrome.png`), and reference it: `["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#6a48d7" }]`. Verify in `.maestro/flows` on the Xiaomi test device.
- **Good as it stands:** channel created on first start with a v2 id and the legacy channel deleted (`lib/push.ts:84–95`), `IMPORTANCE_HIGH` justified, categories with lock-screen actions, permission asked **only after** the contact opt-in card that explains why, `pushPermissionBlocked()` for the Android-13 one-shot, taps and presses queued on device until the API has them, and badges deliberately never set (CLAUDE.md rule 6 — learners never see counts).

---

### Feedback & Affordances — 🟡 Needs work

#### 🟡 `CircleBtn` has no pressed state

- **Where:** `apps/mobile/components/lb/CircleBtn.tsx:56–64`
- **Problem:** The 44 pt icon button used for back, close, "+" in the composer, mic, camera and talk renders its inner view outside the `Pressable`'s state function: nothing changes on touch-down. Every sibling component does the opposite — `Btn` dims to `opacity: 0.78` plus an Android ripple, `Card` dims to `0.85`, `StartRow` and `OrbitMenu` scale to `0.94`. On a slow network the back button therefore feels dead exactly when a learner taps it twice.
- **Fix:** Wrap the child in the render-prop form and match `Btn`'s value:
  ```tsx
  <Pressable … android_ripple={{ color: 'rgba(0,0,0,0.1)', borderless: true }}>
    {({ pressed }) => <View style={{ …inner, opacity: pressed ? 0.78 : 1 }}>…</View>}
  </Pressable>
  ```
  Apply the same to the password-reveal `Pressable` in `components/lb/LbTextInput.tsx:78–92` (currently the only other interactive element with no press feedback) and to the `Checkbox` row (`components/lb/Checkbox.tsx:19`), where the tick is the only acknowledgement today.

#### 🔵 The toast is one slot with no action

- **Where:** `components/lb/Toast.tsx`, `lib/toast.ts`
- **Problem:** Three small things in one component. `pointerEvents="none"` means an error pill cannot be dismissed or retried from where it appears; `show()` replaces whatever is showing instead of queueing, so two quick failures lose the first message; and the timer is a flat 4500 ms for every tone, where the standard is ~2–3 s for a confirmation and 5–7 s for an error someone has to read and act on.
- **Fix:** Keep the pill non-interactive for `info`, but give `error` an optional action (`toast.show(text, 'error', { action: { label: t('actions.retry'), onPress } })`) rendered inside a pressable pill; queue messages in `lib/toast.ts` (the store already has `seq`, so a FIFO of at most 2–3 is a few lines and unit-testable like the rest of that file); make the duration tone-dependent.

#### 🔵 No undo after a destructive action

- **Where:** `app/library.tsx:305–318` (delete sheet), `app/memory.tsx:110–115` (`confirmRemove`)
- **Problem:** `docs/UX-PRINCIPLES.md` prefers **undo over confirmation**; both destructive paths in the app do the opposite — a confirm sheet, then a plain "gelöscht" toast with no way back. The draft-photo path already does this right ("Rückgängig" in the notice bubble), which makes the inconsistency visible.
- **Fix:** Where the API allows retraction (memory entries carry a `version` and the server has `retract`), show the toast with an "Rückgängig" action for ~7 s and only then let it settle. Where deletion is truly final (material and its photos in storage), keep the confirmation and say so in the sheet: "Das lässt sich nicht zurücknehmen."

---

### Onboarding — 🟡 Needs work

#### 🟡 The profile / parents' step does not survive an OS kill

- **Where:** `app/profile.tsx:60–80` (all of `relation`, `name`, `day/month/year`, `locale`, `consent`, `contactOk`, `pin`, `pinRepeat`, `step` are `useState` only)
- **Problem:** This is the one flow in the app where two people cooperate — the child fills the first card, hands the phone over, the adult ticks consent and sets the PIN. A call, a low-memory kill or "just checking the e-mail app" mid-step drops everything typed and restarts at "Wer lernt?". The audit standard treats surviving an OS kill as a baseline onboarding requirement, and this app already owns the machinery for it (`lib/capture/draftStorage.ts` for photo drafts, `outboxStorage` for small values).
- **Fix:** Persist a profile draft (`lb.profile.draft`) on every change with the PIN fields excluded, rehydrate it in a mount effect, and clear it after `createLearner` succeeds. Keep the current behaviour that the step index is restored too — coming back to "Eltern" rather than to the beginning is the whole point.
- **Good as it stands:** three skippable cards, no permission asked before the card that explains it, a progress indicator that is one accessible element with a value, "Ich selbst" under 16 routed to an adult-takes-over path instead of a dead end, and the language chosen before the fields that open the keyboard (a fix that came out of real user feedback).

---

### Deep Linking — 🟡 Needs work

#### 🟡 Universal Links and App Links are declared but nothing backs them

- **Where:** `app.json` → `ios.associatedDomains: ["applinks:learnbuddy.app"]` and `android.intentFilters[0]` with `autoVerify: true` for `https://learnbuddy.app`
- **Problem:** No `apple-app-site-association` and no `assetlinks.json` exist anywhere in the repo, no route or deployment step serves them, and the docs never mention them. Auth mails deliberately use the custom scheme (`authRedirect()` → `learnbuddy://reset-password`), so **nothing is broken today** — but the declaration is dead weight: Android's verification silently fails, Apple review looks at declared entitlements, and the first `https://learnbuddy.app/...` link anyone sends (a share link, a campaign, a mail template) will open the browser instead of the app.
- **Fix:** Either host both files under `https://learnbuddy.app/.well-known/` — AASA as `application/json` with the real team+bundle id, `assetlinks.json` with the Play app-signing SHA-256 — and add a line to `docs/architecture.md §Delivery` saying who owns them; or remove the two declarations until the domain serves them. Test on a device (Universal Links never work in the simulator).
- **Good as it stands:** `+native-intent.tsx` keeps the share-extension URL out of the router, `+not-found.tsx` sends unknown links to the gate rather than a blank screen, and a deep link that arrives signed out is remembered and replayed after sign-in (`app/_layout.tsx:238–246`).

---

### Platform Conventions & Design Consistency — 🟡 / 🟢

#### 🟡 The dark look stops at the app's own pixels

- **Where:** `app.json` → `"userInterfaceStyle": "light"`; no `keyboardAppearance` anywhere in the codebase (grep: zero hits); `lib/theme/palettes.ts:124` (`night`), offered in Settings → Aussehen as "Nacht" together with Pastell, Wald, Meer, Abend
- **Problem:** A learner who picks "Nacht" gets a deep violet-grey app with a **bright white keyboard**, light text-selection menus and light system pickers, because the app declares itself light-only and no field overrides the keyboard appearance. The reverse gap also exists: a phone in system dark mode opens LearnBuddy in Pastell and there is no "wie das Handy" option, so the learner has to know the setting exists.
- **Fix:** Two steps, neither of which touches the brand colours. (1) Derive the keyboard from the palette that is showing — `barStyleFor(palette.bg)` already exists in `lib/theme/luminance.ts`, so `keyboardAppearance={barStyleFor(palette.bg) === 'light' ? 'dark' : 'light'}` in `LbTextInput` and the composer's `TextInput` covers every field in the app. (2) Add a "Wie das Handy" entry to `LookSection` that follows `useColorScheme()` (night when dark, pastellSoft when light) and keep `userInterfaceStyle: "light"` — flipping it to `automatic` would darken native chrome under the _light_ palettes too.

#### 🔵 The root frame keeps the previous palette until it re-renders

- **Where:** `app/_layout.tsx:110` — `useTheme()` is called **above** `ThemeProvider`, so it falls back to `contextOf(activeTheme(), …)` (by design, per the comment in `ThemeProvider.tsx`) but does not subscribe to `onPaletteApplied`
- **Problem:** After a theme switch, `GestureHandlerRootView`'s `backgroundColor` and the `Stack`'s `contentStyle` keep the old palette until `RootLayout` happens to re-render for another reason. Every screen paints its own background, so the effect is limited to the sliver visible during a push/pop animation — cosmetic, but it is the same class of bug issue #84 was about.
- **Fix:** Subscribe the root: `const name = useSyncExternalStore(onPaletteApplied, activeTheme, activeTheme)` next to the existing `useTheme()` call (one line, no structural change), or move the frame inside `ThemeProvider`.

**Design consistency is otherwise 🟢 and enforced mechanically:** colours reach screens only through `useTheme()` (a lint rule blocks `lib/theme/colors.ts` imports in `app/`), `lib/theme/__tests__/frozen-colors.test.ts` catches module-scope palette capture, `contrast.test.ts` checks WCAG ratios per palette, one spacing scale with a comment requirement for any other number, and the same component for the same action everywhere (one `Btn`, one `Sheet`, one `EmptyState`, one toast). No `Alert.alert` anywhere in the app — every confirmation is the app's own sheet.

---

### Analytics, Crash Reporting & Support — 🟡

#### 🟡 No crash reporting reaches anyone

- **Where:** `lib/observability/sentry.ts`, `lib/observability/scrub.ts`, `app.config.ts` (`withSentry`), `eas.json`
- **Problem:** The seam is finished and careful — EU ingest enforced at load time, `sendDefaultPii: false`, screenshots and view hierarchy explicitly off, tracing off, breadcrumbs scrubbed, the render boundary reports itself. And it is inert: no `EXPO_PUBLIC_SENTRY_DSN` in either build profile and no `SENTRY_ORG`/`SENTRY_PROJECT`, so a crash on the daughter's phone leaves no trace anywhere. ANR/hang reporting is likewise off.
- **Fix:** Set the EU DSN as an EAS environment variable for `preview` and `production`, plus `SENTRY_ORG`/`SENTRY_PROJECT` (build-time) and `SENTRY_AUTH_TOKEN` (EAS secret) so stack traces resolve to file names. Nothing else needs to change.
- **Deliberately absent, and should stay absent:** product analytics and funnel instrumentation. The audit standard asks for signup/onboarding funnels; for an app whose users are minors, no third-party tracking is the legally and ethically correct answer (COPPA/GDPR-K, `docs/privacy.md`). Onboarding drop-off stays invisible — that is the price, and it is the right trade here.

#### 🟡 Support contact is hidden and carries no diagnostics

- **Where:** `lib/about.ts`, `components/settings/AboutSection.tsx`
- **Problem:** The support row renders only when `EXPO_PUBLIC_SUPPORT_EMAIL` is set (it is not, in any profile), and when it is, the `mailto:` has no body — a parent writing in has to find the app version, OS version and device model themselves. There is also no in-app help or FAQ, and no bug-report path.
- **Fix:** Set the address (see the Store Readiness fix) and build the `mailto:` with a pre-filled body: app version from `Constants.expoConfig.version`, `Platform.OS`/`Platform.Version`, `Device.modelName`, and the learner's account id (never the e-mail). "Buddy is the help" is a defensible answer to the missing FAQ — but the one thing Buddy cannot help with is Buddy being broken.

---

### Accessibility — 🟢 with two gaps

**Overview:** Among the strongest parts of this codebase. `useAnnounce`/`announce` with a documented plan for the platforms that lack live regions (`lib/announcePlan.ts`), `accessibilityRole="header"` on every screen title, roles and states on every interactive element (including `aria-checked` for React Native Web, where `accessibilityState` alone is dropped), decorative icons hidden with both iOS and Android attributes, `minHeight` instead of `height` so large system text grows components instead of clipping them, `MAX_FONT_SCALE = 2` documented as the WCAG-200 % target, `TOUCH = 44` as a named token, Reduce Motion respected in 18 components, and axe-core (WCAG 2.1 A/AA) run at every stop of the browser walkthrough with serious/critical findings failing the run.

#### 🟡 Bold Text and Reduce Transparency are not consulted

- **Where:** no reference to `AccessibilityInfo.isBoldTextEnabled` / `isReduceTransparencyEnabled` anywhere; translucent surfaces in `components/lb/Glow.tsx`, the sheet veil (`rgba(31,27,46,0.28)`) and `palette.veil`
- **Fix:** Read both once at startup and subscribe (`AccessibilityInfo.addEventListener('boldTextChanged' | 'reduceTransparencyChanged')`); when Reduce Transparency is on, swap `palette.veil` and the sheet veil for opaque tokens and skip the `Glow` gradient; when Bold Text is on, let the system weight through instead of pinning `fontWeight: '600'` on labels.

#### ℹ️ The remaining verification is on-device

axe on the web build proves roles, names, contrast and layout. It cannot prove VoiceOver's reading order, TalkBack's swipe order, or that the announcement plan lands correctly on iOS. The `.maestro` flows exist for the Android device — one pass with TalkBack on, and one with VoiceOver on an iPhone, would close the domain.

---

### Keyboard, Forms & Input — 🟢

`KeyboardSafe` is exactly the kind of single-decision component this domain needs (iOS pads, Android does nothing because the window already resized — with the reasoning and the issue number in the file). CTAs sit outside the `ScrollView` inside it on every form screen; `keyboardShouldPersistTaps="handled"` everywhere; number pads get auto-advance because they have no return key; `onlyDigits` guards Android's number pad emitting `-`, `,` and spaces; the toast lifts above the iOS keyboard; `useRevealInput`/`reveal(index)` scrolls a focused field clear of the keyboard in Settings and the memory list. Small things only:

- **🔵** No clear (×) affordance on text fields (`clearButtonMode` on iOS, a small icon button on Android) — helps most on the e-mail field after a typo.
- **🔵** The composer caps at 2000 characters with no counter and no hint, so the field simply stops accepting keystrokes. A counter from ~1800 on, or a one-line "Das ist lang genug — schick es ab", would explain it. (A learner will rarely reach it; listed for completeness.)
- **🔵** The PIN fields (`app/profile.tsx`, `PinCard`) are masked with no reveal. The repeat field catches typos; a reveal would still help an adult who is interrupted mid-entry.
- **ℹ️** Birth date is three number fields rather than a native picker — contrary to the letter of the standard, but the right call for a date 12–18 years in the past, and it is done properly (digits only, auto-advance, `birthDateOf` validation, an inline error and a hint).

---

### Feedback Components & Error Messages — 🟢

One `messageFor()` turns every failure into calm, specific German (`lib/errors.ts` → `locales/*/errors.json`): no codes, no HTTP numbers, no blame, and a next step in nearly every string ("Keine Verbindung. Check dein Internet und versuch's nochmal."). Severity is matched to the component with visible discipline — inline under the field, a persistent line above a pinned CTA, `ErrorNote` inside a sheet _because a toast would sit behind the sheet_, `NoticeBubble` in the conversation for things Buddy did, a full `EmptyState` with retry only when a screen never loaded, and a failed turn explained in the thread next to "Nochmal senden" rather than in a pill on top of it. A background refresh that fails keeps what is on screen. Remaining nits are the toast items above, plus:

- **🔵** `Banner` carries colour + text but no icon, and takes no action link. It is used for the offline line, where the text does the work — but the standard's "icon + message + optional action" would make the warning and danger tones read faster.
- **🔵** `app/consent.tsx:151` passes `disabled={!accepted || busy}` where every other submit in the app passes `busy={busy}`, so the one tap that creates the account (network + possibly a PIN round-trip) shows no spinner. One-word fix; it is also the app's first impression.

---

### Loading, Empty & Offline States — 🟢

Skeletons per screen shape (`Skeletons.tsx`), a shared `LoadingState` that appears only after 250 ms so a fast load flashes nothing, pull-to-refresh on every data screen, submit buttons that carry their own spinner via `Btn busy`, designed empty states with a working CTA (library → capture, memory → explanation), a persistent offline banner that takes the safe area itself and hands screens `top: 0` so nothing gets a second notch gap, queries paused while offline, and `tests/web/offline.spec.ts` proving an answer given offline is sent exactly once when the connection returns — and again after the app was closed.

---

### Minors, Consent & Parental Controls — 🟢 (exemplary)

Worth naming explicitly, because this is the domain where apps get into legal trouble: birth date at profile creation, under-16 routed to an adult-consent step rather than blocked, the adult's consent and PIN and the child's profile written in **one** request so nothing is half-done, the PIN enforced on the server (`assertAccountHolderOf`) so a client cannot bypass it, the admin token scoped to a single step and cleared on leaving Settings _and_ on backgrounding, own consent at 16 with different copy and no adult in the way, contact opt-in off by default and reducible by the learner alone, no due-counts or missed-day counts ever shown to a learner, no behavioural profiling, and export/deletion available for every account including one whose profile was never finished. The screenshot guard was deliberately **removed** on 2026-09-30 (#128) with the owner's reasoning recorded and `docs/privacy.md` corrected in the same commit — that is the right way to retire a promised measure, and no finding is raised against it.

---

### Performance, Media, Background & Sync — 🟢

`expo-image` with stable `cacheKey`s so signed URLs don't re-download pixels; frames with known aspect ratio so cards never jump; `FlashList` for the three lists that can grow; photos downscaled to 1600 px / JPEG 0.7 **before** upload with the blur/tilt/darkness check run on a smaller copy on-device; PDF size limits enforced before the attempt with copy that says what to do instead; per-page upload progress; reserve → upload → submit split into a testable state machine with retries and give-ups; camera results recovered after Android kills the app mid-session; answers and notification presses queued on disk and replayed idempotently; `focusManager` wired to `AppState` so content refreshes on foreground; `lib/perf.ts` marks tap→reaction spans. The remaining work is measurement on a real device for the current build (cold launch, scroll on the Xiaomi test phone), not code.

---

### Smaller Notes (🔵 / ℹ️)

| Item                                | Where                                       | Note                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English uses `en-GB` formats        | `lib/time.ts:11–21`                         | A US learner sees day-first dates. Resolve the region from `getLocales()[0].regionCode` for the chosen language.                                                                   |
| No "What's New"                     | —                                           | After an OTA or store update nothing tells a returning learner what changed. Three lines in a sheet, once per version, dismissable.                                                |
| No soft update / "restart to apply" | `expo-updates` config, `app/update.tsx`     | The 426 force path is right; an OTA currently applies silently on the next launch. Consider `Updates.checkForUpdateAsync()` on foreground plus a quiet "Neu starten" toast action. |
| No App Intents / quick actions      | —                                           | Share-into-app is done; Siri/Spotlight intents and home-screen quick actions ("Foto machen", "Üben") would fit this app well.                                                      |
| Voice plays in silent mode          | `lib/speech/naturalPlayer.ts:33`, `cues.ts` | `playsInSilentMode: true` is right for a tapped "read this"; for auto-read in voice mode, honouring the mute switch would avoid surprises in class.                                |
| Stale comment                       | `components/lb/PinPad.tsx:2`                | References `(onboarding)/pin-setup` and `(admin)/unlock`, routes that no longer exist.                                                                                             |

---

## Priority Fix List

| #   | Fix                                                                                                                                                                  | Where                                                                                                      | Severity    | Effort   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| 1   | Configure `preview` + `production` builds (API/Supabase, privacy, imprint, support, EU Sentry DSN, source-map vars) and add the "open Settings → Über" release check | `apps/mobile/eas.json`, release checklist                                                                  | 🔴 Critical | 1 hr     |
| 2   | Revoke other sessions after a password change (`admin.signOut(jwt, 'others'\|'global')`) + require the current password for adults + say so in the UI                | `apps/api/src/auth/verifier.ts`, `modules/identity/routes.ts`, `components/settings/AccountAccessCard.tsx` | 🟠 High     | 2 hrs    |
| 3   | Resend the confirmation mail (60 s cooldown), echo the address, spam hint, "andere E-Mail" — in the card and next to `email_not_confirmed`                           | `app/welcome.tsx`, `lib/auth/supabase.ts`, `locales/*/auth.json`                                           | 🟠 High     | 2 hrs    |
| 4   | Add the white-on-transparent 96×96 Android notification icon                                                                                                         | `app.json`, `assets/notification-icon.png`                                                                 | 🟡 Medium   | 30 min   |
| 5   | `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` on every secure-store write                                                                                | `lib/auth/session.ts`                                                                                      | 🟡 Medium   | 15 min   |
| 6   | Pressed state for `CircleBtn`, the password-reveal toggle and the `Checkbox` row                                                                                     | `components/lb/CircleBtn.tsx`, `LbTextInput.tsx`, `Checkbox.tsx`                                           | 🟡 Medium   | 30 min   |
| 7   | `keyboardAppearance` from the palette + a "Wie das Handy" look option                                                                                                | `LbTextInput.tsx`, `components/buddy/Composer.tsx`, `components/settings/LookSection.tsx`                  | 🟡 Medium   | 1 hr     |
| 8   | Host `apple-app-site-association` + `assetlinks.json`, or drop the two declarations                                                                                  | `learnbuddy.app` deployment, `app.json`, `docs/architecture.md`                                            | 🟡 Medium   | 1 hr     |
| 9   | Persist the profile/parent-step draft (PIN excluded) and rehydrate it                                                                                                | `app/profile.tsx`, `lib/api/outboxStorage.ts`                                                              | 🟡 Medium   | 2 hrs    |
| 10  | Toast: queue, tone-dependent duration, optional action on errors                                                                                                     | `lib/toast.ts`, `components/lb/Toast.tsx`                                                                  | 🔵 Low      | 2 hrs    |
| 11  | `busy={busy}` on the consent CTA                                                                                                                                     | `app/consent.tsx`                                                                                          | 🔵 Low      | 5 min    |
| 12  | "Rückgängig" in the toast where the API can retract (memory); say "not undoable" where it cannot (material)                                                          | `app/memory.tsx`, `app/library.tsx`                                                                        | 🔵 Low      | 2 hrs    |
| 13  | Bold Text + Reduce Transparency support                                                                                                                              | `lib/theme/*`, `components/lb/Glow.tsx`, `Sheet.tsx`                                                       | 🔵 Low      | half day |
| 14  | Pre-fill app/OS/device in the support mail                                                                                                                           | `lib/about.ts`, `components/settings/AboutSection.tsx`                                                     | 🔵 Low      | 30 min   |
| 15  | `ITSAppUsesNonExemptEncryption`, iOS dark/tinted icons, `extra.appStoreId`                                                                                           | `app.json`                                                                                                 | 🔵 Low      | 30 min   |
| 16  | Subscribe the root frame to the applied palette                                                                                                                      | `app/_layout.tsx`                                                                                          | 🔵 Low      | 10 min   |
| 17  | Clear (×) on text fields; composer counter near the cap; PIN reveal                                                                                                  | `LbTextInput.tsx`, `Composer.tsx`, `profile.tsx`                                                           | 🔵 Low      | 1 hr     |
| 18  | On-device accessibility pass: TalkBack on the Xiaomi, VoiceOver on an iPhone                                                                                         | `.maestro/`, manual                                                                                        | 🟡 Medium   | half day |

---

## What's Working Well

Genuine callouts, not padding:

- **One design system, mechanically enforced.** Colours only through `useTheme()`, a lint rule that fails a direct palette import in `app/`, `frozen-colors.test.ts` against module-scope capture, `contrast.test.ts` per palette, one spacing scale where any other number needs a written reason. Five palettes, including a real dark one, and every component reads them at render time.
- **The error-message layer is better than most shipped apps.** One `messageFor()`, no codes, no blame, a next step in nearly every string, and severity matched to the component with the reasoning written next to the choice ("shown in the sheet: a toast would sit behind it").
- **Offline is designed, not bolted on.** An outbox keyed by `client_turn_id`, replay after an app kill, a definite refusal distinguished from an outage, queries paused behind a calm banner, and a Playwright test that proves the answer arrives exactly once.
- **Accessibility is treated as a requirement.** Announcements with a per-platform plan, roles/states everywhere (including the Web-only ARIA gaps), `minHeight` over `height` so large text grows components, Reduce Motion in 18 components, and axe-core failing the walkthrough on serious findings.
- **The minors' path is the best part of the app.** Server-enforced parental PIN scoped to one step, one atomic request for profile + consent + PIN, own consent at 16, contact opt-in off by default and only reducible by the learner, and no counts of due or missed work ever shown to a child.
- **Media handling is right the first time.** Downscale before upload, quality check on-device with named problems, PDF limits enforced before the attempt, camera results recovered after an OS kill, progress per page.
- **Decisions are documented where they were made.** Nearly every non-obvious line carries the issue number and the reason — including reversals (#128 removing the screenshot guard, with `docs/privacy.md` corrected in the same commit). That is what made this audit possible in a single pass, and it is why so few findings here are "why does this do that?".

**Verified during this audit:** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (623 mobile tests, 73 files). The browser walkthrough (`scripts/web-walkthrough.sh`) and the API integration tests were **not** run in this pass (they need a local Postgres and a served build), and nothing was checked on a physical device — every device-specific claim above is marked as such.
