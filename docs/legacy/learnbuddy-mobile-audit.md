# LearnBuddy — Mobile App Audit

**Platform:** iOS + Android  
**Framework:** Expo / React Native + NativeWind  
**App type:** EdTech · Consumer · Family (minors + account holders) · Subscription  
**Date:** 2026-05-17

---

## TL;DR

LearnBuddy is a well-structured educational app with a solid technical foundation — SecureStore tokens, Sentry crash reporting, PostHog analytics, shared Toast/EmptyState/Btn components, and a real multi-step onboarding flow. The most urgent problems are a missing password-visibility toggle on the login screen, raw error messages exposed to users in the ErrorBoundary, camera permissions requested on screen entry before any user action, and hardcoded German strings scattered throughout infrastructure code (notifications, toast messages, error boundary) that break every non-German user.

**Top 3 urgent fixes:**

1. Add eye-toggle to `login.tsx` and `reset-password.tsx` new-password field
2. Remove raw `error.message` from ErrorBoundary's visible UI
3. Localize hardcoded German strings in `Toast.tsx`, `notifications.ts`, and `ErrorBoundary.tsx`

---

## Score Overview

| Domain                             | Score | Top Issue                                                                                         |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Feedback & Error Messages          | 🟡    | No icon on toasts; inconsistent error patterns; raw message in ErrorBoundary                      |
| Loading / Empty / Offline          | 🟡    | Spinner instead of skeletons; no offline detection; empty error state has no retry                |
| Authentication                     | 🟠    | Password toggle missing on login + reset; no autofill hints; login Btn not disabled during submit |
| Onboarding                         | 🟢    | Multi-step flow is complete; age-check + consent + verification all present                       |
| Keyboard & Input                   | 🟠    | No field-to-field tab chain; no returnKeyType; no iOS textContentType                             |
| Forms & Validation                 | 🟡    | On-submit-only validation; no inline errors; inconsistent error UI                                |
| Navigation & Flow                  | 🟡    | Practice tab navigates to home; pull-to-refresh absent                                            |
| Feedback & Affordances             | 🟠    | No pressed state on Btn or tiles; Android ripple absent                                           |
| Permissions                        | 🔴    | Camera permission auto-requested on screen entry, not on user action                              |
| Notifications                      | 🟠    | Copy hardcoded in German; no notification deep links; no foreground banner                        |
| Accessibility                      | 🟡    | SubjectTile no a11y role/label; Btn sm < 44pt; hardcoded font sizes                               |
| Privacy & Security                 | 🟡    | Raw error.message in ErrorBoundary UI; app switcher not masked                                    |
| App Lifecycle                      | 🟡    | No pull-to-refresh; no app-foreground refetch                                                     |
| In-App Purchases                   | 🟢    | RevenueCat wired; subscription screen exists                                                      |
| i18n / Localization                | 🟠    | German hardcoded in toast, notifications, boundary, capture errors                                |
| Analytics & Crash Reporting        | 🟢    | Sentry + PostHog both configured; privacy-conscious                                               |
| Platform Conventions (iOS/Android) | 🟡    | No KeyboardAvoidingView on login; no textContentType; no android_ripple                           |
| Design Consistency                 | 🟡    | Error display pattern inconsistent: inline text vs Alert.alert vs Toast                           |
| Store Readiness                    | 🟡    | Account deletion ✅; privacy policy in-app not confirmed; push permission timing                  |

---

## Findings by Domain

---

### Authentication — 🟠 Needs Work

**Overview:** The combined welcome screen is solid (tab switcher, eye toggle, disabled CTA while busy). The standalone `login.tsx` and `reset-password.tsx` are missing features the welcome screen already has.

#### Findings

**🔴 No password show/hide toggle on login.tsx**

- **Where:** `apps/mobile/app/login.tsx:100–103`
- **Problem:** `secureTextEntry` is hardcoded with no eye-button. The welcome screen (`welcome.tsx:216–238`) already has a working eye-toggle. Users who navigate directly to `/login` cannot reveal their password.
- **Fix:** Copy the `Pressable` + `Icon name={showPassword ? 'eye-off' : 'eye'}` pattern from `welcome.tsx` into the `Input` wrapper or inline, exactly as done in `account-signup.tsx:105–137`.

**🔴 No password show/hide toggle on reset-password.tsx new-password field**

- **Where:** `apps/mobile/app/reset-password.tsx:157–164`
- **Problem:** When a user sets a new password after following the email link, the field is masked with no way to verify what they typed.
- **Fix:** Wrap the new-password `Input` in a `View` with a `Pressable` eye-toggle using the same pattern as `welcome.tsx`.

**🟠 Login Btn has no disabled prop during in-flight request**

- **Where:** `apps/mobile/app/login.tsx:119–121`
- **Problem:** `<Btn ... onPress={onSubmit}>` — no `disabled={busy}`. Text changes to "Moment …" but the button visually appears active. Compare to `welcome.tsx:262` which correctly passes `disabled={!canSubmit}`.
- **Fix:** Add `disabled={!canSubmit}` to the Btn in `login.tsx`.

**🟠 No textContentType / autofill hints on credential fields**

- **Where:** `apps/mobile/app/login.tsx:87–95` (email + password Input)
- **Problem:** Neither field declares `textContentType` (iOS Keychain / iCloud Keychain). Password manager integration is broken — users must copy-paste manually.
- **Fix:** Add `textContentType="username"` to email, `textContentType="password"` to login password, `textContentType="newPassword"` to signup password.

**🟡 No password strength indicator on signup**

- **Where:** `apps/mobile/app/(onboarding)/account-signup.tsx` and `welcome.tsx` (signup mode)
- **Problem:** The only feedback is a hard block at < 8 characters. Users don't know what makes a strong password and get no progressive guidance while typing.
- **Fix:** Add a simple 4-bar strength meter below the password field that fires in real-time.

**🟡 No "back to login" path from duplicate-email error**

- **Where:** `apps/mobile/app/(onboarding)/account-signup.tsx:62`
- **Problem:** When `error_conflict` fires (email already taken), there's no tappable "Already have an account? Sign in" path. Currently just red text.
- **Fix:** Add a `Pressable` below the conflict error text that routes to the login tab/screen.

---

### Permissions — 🔴 Critical

**Overview:** Camera permission handling is otherwise thoughtful (fallback UI, Settings link) but the trigger timing violates the fundamental mobile permission principle.

#### Findings

**🔴 Camera permission requested on screen mount, not on user action**

- **Where:** `apps/mobile/app/(learner)/capture.tsx:92–96`
- **Problem:** `useEffect` calls `requestPermission()` the moment the screen loads. Both iOS and Android guidelines require permission prompts to be triggered by the specific user action that needs them (tapping the shutter). Requesting on mount is a top reason for App Store review rejection.
- **Fix:** Remove the auto-request `useEffect`. In `onShutter()`, check `permission.granted` first; if not granted and `permission.canAskAgain`, call `requestPermission()` at that point. If already denied → show the existing settings-redirect screen.

---

### Feedback Components — 🟡 Needs Work

**Overview:** The Toast system is architecturally solid (shared Zustand store, imperative facade, semantic tones). Three issues: icons are missing (color-only differentiation), all tones use the same 3.5s duration, and error display patterns are inconsistent across the app.

#### Findings

**🟠 Toast has no icon — color alone differentiates tones**

- **Where:** `apps/mobile/components/lb/Toast.tsx:113–128`
- **Problem:** Background color (`TONE_BG`) is the only differentiator between info/success/warning/error. ~8% of men have red-green color deficiency. The `info` (dark purple) vs `error` (dark red) distinction is subtle even for people without color blindness.
- **Fix:** Add a small icon prefix inside `ToastRow` — use the `Icon` component with names like `check-circle` (success), `info` (info), `alert-triangle` (warning), `x-circle` (error).

**🟡 All toast tones auto-dismiss at 3.5s — error needs more time**

- **Where:** `apps/mobile/components/lb/Toast.tsx:96`
- **Problem:** `setTimeout(..., 3500)` is hardcoded for all tones. Error/warning toasts should persist 5–7 seconds. The `showApiErrorToast` cases like `upload_failed` have body copy that takes ~4s to read.
- **Fix:** Add an optional `duration` to `ToastItem` (default 3500 for success/info, 6000 for warning/error) and use it in the `setTimeout`.

**🟠 Inconsistent error display pattern across screens**

- **Where:** Multiple screens
- **Problem:** Three different patterns in use: (1) inline `<Text style={{ color: LB.danger }}>` in auth forms, (2) `Alert.alert(...)` in home.tsx AddSubjectModal and capture.tsx, (3) Toast in session and API paths. Form errors should be inline. Action errors should be Toast. `Alert.alert` only for destructive confirmations.
- **Fix:** Replace `Alert.alert` in `home.tsx:276` and `capture.tsx:167` with `toast.error(...)`.

**🟡 Toast action button absent — "Verlängere im Konto" copy is a dead call-to-action**

- **Where:** `apps/mobile/components/lb/Toast.tsx:141–147`
- **Problem:** `insufficient_credits` toast says "Verlängere im Konto, dann geht es weiter" but provides no tappable path to navigate there.
- **Fix:** Add optional `action: { label: string; onPress: () => void }` to `ToastItem`. Wire `insufficient_credits` to navigate to `/(admin)/subscription`.

---

### Loading, Empty & Offline States — 🟡 Needs Work

**Overview:** EmptyState component exists and is used. Loading shows spinners instead of skeletons. No offline handling anywhere.

#### Findings

**🟡 Spinner instead of skeleton on Home screen**

- **Where:** `apps/mobile/app/(learner)/home.tsx:148–150`
- **Problem:** `<ActivityIndicator>` while subjects load. A skeleton that approximates the 2-column tile grid avoids jarring content jumps and feels faster.
- **Fix:** Build a `SubjectGridSkeleton` with 4 shimmer-animated tiles using `Animated` + `useNativeDriver`.

**🟠 EmptyState error variant has no retry action**

- **Where:** `apps/mobile/app/(learner)/home.tsx:153`
- **Problem:** `<EmptyState glyph="⚠️" ... />` with no `action` prop. Users hit a loading error with no way to retry — a dead end.
- **Fix:** Pass `action={<Btn onPress={() => subjectsQuery.refetch()} size="sm">Nochmal versuchen</Btn>}`.

**🟠 No pull-to-refresh on Home screen**

- **Where:** `apps/mobile/app/(learner)/home.tsx:125`
- **Problem:** `refreshControl={undefined}` is explicit. Pull-to-refresh is expected on any content list.
- **Fix:** Replace with `refreshControl={<RefreshControl refreshing={subjectsQuery.isFetching} onRefresh={() => { void subjectsQuery.refetch(); void accountQuery.refetch(); }} />}`.

**🔴 No offline detection or handling**

- **Where:** App-wide
- **Problem:** When the device loses internet, the app makes silent network calls that fail with no user feedback. No offline banner, no cached-data indicator, no "You're offline" state.
- **Fix:** Add a network state listener (`@react-native-community/netinfo` or `expo-network`) in the root layout. When offline, show a persistent banner: "Keine Verbindung — Inhalte werden gespeichert". Previously-loaded TanStack Query data should remain visible; only new fetches show the offline state.

---

### Keyboard & Input Behavior — 🟠 Needs Work

**Overview:** Keyboard types are correct (email fields get email keyboard). The major gap is the complete absence of field-to-field keyboard navigation and `KeyboardAvoidingView` on login.

#### Findings

**🟠 No returnKeyType="next" / field-chain navigation on login form**

- **Where:** `apps/mobile/app/login.tsx:87–101` and `welcome.tsx:203–239`
- **Problem:** Email field doesn't set `returnKeyType="next"` or `onSubmitEditing` to move focus to the password field. Tapping Return dismisses the keyboard instead of advancing focus.
- **Fix:** Add `returnKeyType="next"` + `onSubmitEditing={() => passwordRef.current?.focus()}` to the email field; `returnKeyType="go"` + `onSubmitEditing={onSubmit}` to the password field; `ref={passwordRef}` using `useRef<TextInput>(null)`.

**🟡 No KeyboardAvoidingView on login.tsx**

- **Where:** `apps/mobile/app/login.tsx:68–124`
- **Problem:** The CTA is pinned at the bottom with `justifyContent: 'space-between'`. On small devices or with a large keyboard, the keyboard can cover the password field. `welcome.tsx` uses `ScrollView` + `keyboardShouldPersistTaps="handled"` which handles this correctly.
- **Fix:** Wrap content in `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`, or migrate `login.tsx` to the ScrollView pattern from `welcome.tsx`.

---

### Forms & Data Entry — 🟡 Needs Work

#### Findings

**🟡 No inline validation on any form**

- **Where:** All auth forms
- **Problem:** Validation only fires on submit or API error. Email format is never checked client-side — users get the error only after a network round-trip.
- **Fix:** Add `onBlur` handlers: check email format with a simple regex on blur; show inline error text under the field.

---

### Navigation & Flow Completeness — 🟡 Needs Work

#### Findings

**🟡 Practice tab in BottomNav navigates to Home**

- **Where:** `apps/mobile/app/(learner)/_layout.tsx:23`
- **Problem:** `else if (k === 'practice') router.push('/(learner)/home')` — tapping Practice goes to Home. Will confuse users expecting practice functionality.
- **Fix:** Wire Practice tab to a practice-selection screen, or hide the tab until ready.

**🟡 No subject edit/delete affordance on tiles**

- **Where:** `apps/mobile/app/(learner)/home.tsx` SubjectTile
- **Problem:** Every "create" needs an accessible "edit" and "delete". No long-press context menu or swipe action on SubjectTile for managing subjects.
- **Fix:** Add long-press context menu on SubjectTile with Edit / Delete options.

---

### Feedback & Affordances — 🟠 Needs Work

#### Findings

**🟠 No pressed/highlighted state on Btn or Pressable items**

- **Where:** `apps/mobile/components/lb/Btn.tsx:51–83`, SubjectTile, capture thumbnails
- **Problem:** No `style` callback for pressed state, no `android_ripple`. On Android every tap feels unresponsive. On iOS there's no tap feedback. Users can't tell if their tap registered.
- **Fix:** In `Btn.tsx`: `style={({ pressed }) => [baseStyle, pressed && { opacity: 0.75 }]}`. Add `android_ripple={{ color: 'rgba(0,0,0,0.1)' }}`. Apply same to SubjectTile and other tappable Pressables.

---

### Privacy & Security — 🟡 Needs Work

#### Findings

**🟡 ErrorBoundary renders raw error.message in the UI**

- **Where:** `apps/mobile/components/lb/ErrorBoundary.tsx:62–66`
- **Problem:** `<Text>{message}</Text>` renders `error.message` verbatim. Some error messages contain internal paths, API endpoints, or network response snippets. Sentry already captures the full error — users don't need to see it.
- **Fix:** Remove the raw message display. Show only: "Fehler-ID: [Sentry event ID]" or simply remove the technical block entirely. The auto-report copy is sufficient.

**🟡 Deep links use custom scheme instead of Universal Links**

- **Where:** `apps/mobile/app/reset-password.tsx:80`, `verify-email.tsx`
- **Problem:** Custom URL schemes (`learnbuddy://`) can be intercepted by malicious apps that register the same scheme. Universal Links (HTTPS) are hijack-resistant and required for security-sensitive flows like password reset.
- **Fix:** Configure Associated Domains (`applinks:learnbuddy.app`) in iOS + Expo config, Digital Asset Links on the server. Update `redirectTo` to `https://learnbuddy.app/reset-password`.

---

### Internationalization & Localization — 🟠 Needs Work

**Overview:** The app supports 5 languages with a proper i18n setup and domain-split locale files. Several infrastructure-level strings are hardcoded in German, breaking all non-German users.

#### Findings

**🟠 Toast.tsx — showApiErrorToast has hardcoded German strings**

- **Where:** `apps/mobile/components/lb/Toast.tsx:136–198`
- **Problem:** All `known[code]` entries are hardcoded German. English/French/Spanish/Italian users see German error messages.
- **Fix:** Move strings to `locales/*/errors.json` and use `i18n.t('errors.insufficient_credits')` etc. via the `i18n` instance (not the hook, since this is called from outside React).

**🟠 notifications.ts — notification copy hardcoded in German**

- **Where:** `apps/mobile/lib/notifications.ts:98–114, 146–160`
- **Problem:** All notification titles/bodies are hardcoded German. Non-German-locale users receive German notifications.
- **Fix:** Read `i18n.language` at scheduling time. Add a `notifications` namespace to all locale files and use `i18n.t('notifications.daily_title')` etc.

**🟡 ErrorBoundary.tsx — hardcoded German**

- **Where:** `apps/mobile/components/lb/ErrorBoundary.tsx:48–76`
- **Problem:** All visible strings are hardcoded German. ErrorBoundary is a class component (no hooks) but can call `i18n.t()` directly.
- **Fix:** Import `i18n` from `../../lib/i18n/index.js` and use `i18n.t('errors.boundary_title')` etc. Add keys to all locale files.

**🟡 capture.tsx — hardcoded German in Alert.alert**

- **Where:** `apps/mobile/app/(learner)/capture.tsx:167, 283–290`
- **Problem:** `Alert.alert('Ups.', ...)` and `'Foto löschen?', ..., 'Abbrechen', 'Löschen'` are hardcoded.
- **Fix:** Use `t('capture.error_title')`, `t('capture.photo_delete.title')` etc. in `locales/*/capture.json`.

**🟡 login.tsx — "Moment …" loading text hardcoded**

- **Where:** `apps/mobile/app/login.tsx:121`
- **Problem:** `busy ? 'Moment …'` is hardcoded German while the CTA uses `t()`.
- **Fix:** Use `t('login.busy')`.

---

### Accessibility — 🟡 Needs Work

#### Findings

**🟡 SubjectTile missing accessibilityRole and label**

- **Where:** `apps/mobile/app/(learner)/home.tsx:194–215`
- **Problem:** `<Pressable>` with no `accessibilityRole` or `accessibilityLabel`. VoiceOver/TalkBack users hear nothing useful.
- **Fix:** Add `accessibilityRole="button"` and `accessibilityLabel={subject.name}`.

**🟡 Btn "sm" size (38px height) below 44pt iOS minimum**

- **Where:** `apps/mobile/components/lb/Btn.tsx:22`
- **Problem:** `sm: { height: 38 }` — below Apple's 44pt minimum touch target.
- **Fix:** Increase to 44, or add `hitSlop={{ top: 3, bottom: 3 }}`.

**🟡 Hardcoded font sizes don't respect Dynamic Type**

- **Where:** App-wide
- **Problem:** All font sizes are hardcoded in points. React Native doesn't auto-scale these with the user's system text size setting.
- **Fix:** Ensure no `allowFontScaling={false}` is set (none found, good). Test at 2× system font scale and ensure nothing clips.

**🟡 Decorative emoji not hidden from screen readers**

- **Where:** `EmptyState.tsx:23–32`, `home.tsx:204`
- **Problem:** Decorative emoji are announced by VoiceOver with their full Unicode description ("Triangular ruler").
- **Fix:** Wrap emoji in `<Text accessible={false} importantForAccessibility="no-hide-descendants">`.

---

### Notifications — 🟠 Needs Work

#### Findings

**🟠 No notification deep links**

- **Where:** `apps/mobile/lib/notifications.ts`
- **Problem:** `scheduleNotificationAsync` doesn't set a `data` payload with a route. Notification taps open the root/home screen.
- **Fix:** Add `data: { route: '/(learner)/home' }` (or a specific practice/subject route) to each notification. In root layout, add a tap listener that calls `router.push(data.route)`.

**🟡 No in-app foreground notification handling**

- **Where:** Root layout
- **Problem:** iOS suppresses notification banners when the app is in the foreground. There's no in-app substitute.
- **Fix:** Add `Notifications.setNotificationHandler` returning `{ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }`, or pipe foreground notifications through the Toast system.

---

### App Lifecycle & State — 🟡 Needs Work

#### Findings

**🟡 No app-foreground refetch trigger**

- **Where:** Root layout
- **Problem:** When the user backgrounds the app and returns after several minutes, TanStack Query serves stale cached data without triggering a refresh.
- **Fix:** Use `AppState.addEventListener('change', state => { if (state === 'active') qc.invalidateQueries() })` in the root layout, or configure the TanStack Query `focusManager`.

---

### Performance — 🟡 Needs Work

#### Findings

**🟡 Animated.Value created inline in ToastRow render**

- **Where:** `apps/mobile/components/lb/Toast.tsx:89`
- **Problem:** `const opacity = new Animated.Value(0)` inside the function body creates a new instance on every render cycle — a React Native anti-pattern that can cause animation jitter.
- **Fix:** `const opacity = useRef(new Animated.Value(0)).current;`

---

### Design Consistency — 🟡 Needs Work

#### Findings

**🟡 Three different patterns for action errors**

- Inline `<Text>` (auth forms), `Alert.alert` (modal + camera), Toast (API errors). Rule: form validation → inline; action errors → Toast; destructive confirmations → Alert.alert. Consolidate `Alert.alert` usages in `home.tsx:276` and `capture.tsx:167` to Toast.

**🟡 Input component duplicated across three screens**

- **Where:** `login.tsx:127`, `account-signup.tsx:162`, `reset-password.tsx:192`
- **Problem:** Identical local `Input` function definitions. Any future style change must be made in three places.
- **Fix:** Extract to `components/lb/LbInput.tsx` and export from the `lb` index.

---

### Store Readiness — 🟡 Needs Work

#### Findings

**🟡 Notification permission requested with no in-app rationale**

- **Where:** `apps/mobile/lib/notifications.ts:81–84`
- **Problem:** `requestPermissionsAsync()` is called without an in-app explanation first. App Store review flags apps that show OS permission prompts without prior context.
- **Fix:** Create an in-app notification permission screen that explains the value, then calls `ensurePermissions()` only after the user taps "Ja, erlauben".

---

## Priority Fix List

| #   | Fix                                                                | Where                                            | Severity    | Effort   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------ | ----------- | -------- |
| 1   | Add password show/hide toggle                                      | `login.tsx:99–103`                               | 🔴 Critical | 15 min   |
| 2   | Add password show/hide toggle to reset-password new-password field | `reset-password.tsx:157`                         | 🔴 Critical | 15 min   |
| 3   | Remove raw `error.message` from ErrorBoundary UI                   | `ErrorBoundary.tsx:64`                           | 🔴 Critical | 10 min   |
| 4   | Fix camera permission — request on shutter tap, not on mount       | `capture.tsx:92–96`                              | 🔴 Critical | 20 min   |
| 5   | Add offline detection + banner                                     | Root layout                                      | 🟠 High     | 1 hr     |
| 6   | Add `disabled={busy}` to login Btn                                 | `login.tsx:119`                                  | 🟠 High     | 5 min    |
| 7   | Localize `showApiErrorToast` strings                               | `Toast.tsx:136–198`                              | 🟠 High     | 1 hr     |
| 8   | Localize notification copy                                         | `notifications.ts:98–114, 146–160`               | 🟠 High     | 45 min   |
| 9   | Add icon to Toast rows                                             | `Toast.tsx:113–128`                              | 🟠 High     | 30 min   |
| 10  | Add `returnKeyType="next"` + field chain to all auth forms         | `login.tsx`, `welcome.tsx`, `account-signup.tsx` | 🟠 High     | 1 hr     |
| 11  | Add `textContentType` / autofill hints to credential fields        | `login.tsx`, `account-signup.tsx`                | 🟠 High     | 30 min   |
| 12  | Add pressed state to Btn + android_ripple                          | `Btn.tsx:51`                                     | 🟠 High     | 20 min   |
| 13  | Add retry action to EmptyState error on Home                       | `home.tsx:153`                                   | 🟠 High     | 15 min   |
| 14  | Add pull-to-refresh to Home screen                                 | `home.tsx:125`                                   | 🟠 High     | 20 min   |
| 15  | Replace Alert.alert with Toast for AddSubjectModal error           | `home.tsx:276`                                   | 🟡 Medium   | 10 min   |
| 16  | Replace Alert.alert with Toast for capture camera error            | `capture.tsx:167`                                | 🟡 Medium   | 10 min   |
| 17  | Localize ErrorBoundary strings                                     | `ErrorBoundary.tsx:48–76`                        | 🟡 Medium   | 30 min   |
| 18  | Localize capture.tsx hardcoded German in Alert                     | `capture.tsx:167, 283–290`                       | 🟡 Medium   | 20 min   |
| 19  | Add notification deep links (data payload + tap handler)           | `notifications.ts` + root layout                 | 🟡 Medium   | 1 hr     |
| 20  | Add accessibilityRole + label to SubjectTile                       | `home.tsx:194`                                   | 🟡 Medium   | 10 min   |
| 21  | Fix `Animated.Value` in ToastRow — use useRef                      | `Toast.tsx:89`                                   | 🟡 Medium   | 5 min    |
| 22  | Add app-foreground refetch trigger (AppState listener)             | Root layout                                      | 🟡 Medium   | 30 min   |
| 23  | Add inline blur validation for email/password fields               | Auth forms                                       | 🟡 Medium   | 45 min   |
| 24  | Skeleton screens for Home subject grid                             | `home.tsx:148`                                   | 🟡 Medium   | 1 hr     |
| 25  | Extract duplicate `Input` component to shared lb component         | 3 screens                                        | 🟡 Medium   | 30 min   |
| 26  | Increase Btn sm height to 44pt                                     | `Btn.tsx:22`                                     | 🟡 Medium   | 5 min    |
| 27  | Add password strength indicator to signup                          | `account-signup.tsx`, `welcome.tsx`              | 🟡 Medium   | 45 min   |
| 28  | Wire Practice tab to real screen (or hide it)                      | `_layout.tsx:23`                                 | 🟡 Medium   | varies   |
| 29  | Add in-app notification permission rationale screen                | Notifications flow                               | 🟡 Medium   | 30 min   |
| 30  | Replace custom scheme deep links with Universal Links              | `reset-password.tsx`, `verify-email.tsx`         | 🟡 Medium   | half day |

---

## What's Working Well

**Secure token storage.** Auth tokens in `expo-secure-store` (Keychain/Keystore) from day one. Many apps get this wrong.

**Toast architecture.** The Zustand-backed `ToastHost` with an imperative `toast.xxx()` facade is the correct pattern — API clients, error paths, and non-React code all fire toasts consistently through one shared component.

**Error boundary + Sentry.** `ErrorBoundary` wraps the entire app, auto-reports to Sentry, and provides a "Nochmal versuchen" reset action that lets users recover without killing the app.

**Age verification + minor flows.** `age-check.tsx`, `hand-off.tsx`, `profile-minor-consent.tsx`, and the admin-unlock gate in the home screen are thoughtfully built for DSGVO compliance with a family app dealing with minors.

**Analytics discipline.** PostHog configured with `disableGeoip`, a whitelisted `KnownEvent` union type, and no raw content captured. Privacy-conscious analytics from day one.

**i18n structure.** Five languages with domain-split locale files (`auth.json`, `errors.json`, `session.json`, etc.) — the foundation is correct. The scattered hardcoded strings undermine the foundation, not the architecture.

**DSGVO data export + deletion.** Account deletion and data export are accessible in-app, both required by App Store/Play Store rules and GDPR. Both are confirmed before execution with correct Alert patterns.
