# LearnBuddy — Mobile App Audit (Round 2)

**Platform:** iOS + Android  
**Framework:** React Native (Expo SDK 54), Expo Router, TanStack Query, Zustand  
**App type:** Consumer edtech / family — sensitive data (minors, learning records)  
**Date:** 2026-05-17

---

## TL;DR

LearnBuddy has been through an extensive fix marathon — the first audit's 30 findings are almost entirely resolved. What remains is a second tier of polish: missing in-app rating/support flows, accessibility gaps on custom interactive components (tabs, checkboxes, year grid), a silent failure mode on the result screen, and a handful of UX loose ends. The app is now close to production-ready; the items below are what stands between "almost there" and "ships with confidence."

**Top 3 most urgent fixes:**

1. Add an in-app rating prompt (`StoreReviewController.requestReview()`) — no ratings flow exists anywhere
2. Add in-app support/FAQ contact — users who hit problems have no path to help
3. Fix accessibility roles on custom interactive components (tabs, checkboxes, year grid, language selector)

---

## Score Overview

| Domain                      | Score | Top Issue                                                        |
| --------------------------- | ----- | ---------------------------------------------------------------- |
| Feedback & Error Messages   | 🟢    | N/A — Toast system + inline errors + ErrorBoundary all solid     |
| Loading / Empty / Offline   | 🟢    | N/A — Skeleton, EmptyState, OfflineBanner all solid              |
| Authentication              | 🟢    | N/A — Confirm password, strength meter, toggles all done         |
| Onboarding                  | 🟡    | No "What's New" modal for returning users after updates          |
| Keyboard & Input            | 🟢    | N/A — KeyboardAvoidingView, returnKeyType chains all done        |
| Forms & Validation          | 🟡    | reset-password.tsx uses inline custom input (inconsistent)       |
| Navigation & Flow           | 🟡    | result.tsx both CTAs navigate to same screen                     |
| Feedback & Affordances      | 🟢    | N/A — all buttons have states, pull-to-refresh, toasts           |
| Permissions                 | 🟢    | N/A — lazy request, rationale banners                            |
| Notifications               | 🟢    | N/A — scheduling, deep-link, foreground handling all done        |
| Accessibility               | 🟡    | Custom tabs, checkboxes, radio groups missing ARIA roles         |
| Privacy & Security          | 🟢    | N/A — SecureStore, DSGVO, deletion flow, HTTPS                   |
| App Lifecycle               | 🟢    | N/A — focus manager, error boundary, force-update                |
| Credential Storage          | 🟢    | N/A — all tokens in Keychain/Keystore via SecureStore            |
| Age Verification & Minors   | 🟢    | N/A — age check, minor consent, parental consent complete        |
| In-App Purchases            | 🟡    | Verify dynamic pricing display (not hardcoded locale strings)    |
| Performance                 | 🟡    | Unclear if image loading uses fast caching (expo-image vs Image) |
| Internationalization        | 🟢    | N/A — 5 locales, zero hardcoded strings                          |
| Analytics & Crash Reporting | 🟢    | N/A — PostHog EU-compliant + Sentry                              |
| Customer Support & Help     | 🔴    | No in-app help, FAQ, or support contact                          |
| App Rating & Review         | 🔴    | No StoreReviewController.requestReview() — no path to ratings    |
| Search                      | —     | App has no search feature — domain skipped                       |
| Advanced Security           | 🟡    | No app-switcher masking for minor-sensitive screens              |
| What's New                  | 🟡    | No modal for existing users after app updates                    |
| App Updates & Migration     | 🟢    | Force-update modal wired, version endpoint live                  |
| Accessibility Extended      | 🟡    | Reduce Motion not checked; basic a11y gaps on custom components  |
| Physical Keyboard / iPad    | 🟡    | Not addressed (Expo default handling only)                       |
| Rich Notifications          | 🟡    | Basic push only — no notification action buttons                 |
| App Shortcuts / Siri        | 🔵    | No Siri Shortcuts wired                                          |
| Deep Linking                | 🟢    | N/A — Universal Links + verify-email/reset-password handling     |
| Media & Camera              | 🟢    | N/A — quality scoring, permission handled correctly              |
| Background Processing       | 🟡    | Upload via SSE but no background completion if app backgrounded  |
| Offline-First & Data Sync   | 🟡    | OfflineBanner + stale queries — no write queue                   |
| Scroll Behavior             | 🟢    | N/A — keyboardShouldPersistTaps, RefreshControl                  |
| Platform Conventions        | 🟡    | iOS-specific: no large title, no swipe-back on modal             |
| Design Consistency          | 🟢    | LB tokens used throughout; LbTextInput standardized              |
| Store Readiness             | 🟡    | Missing rating prompt and in-app support                         |

---

## Findings by Domain

---

### Customer Support & In-App Help — 🔴 Critical

**Overview:** There is no way for a user to get help from within the app. No FAQ, no support contact, no bug report path. When something breaks — especially payments or account access — users have nowhere to go.

#### Findings

**🔴 No support contact reachable from the app**

- **Where:** `app/(admin)/about.tsx`
- **Problem:** Shows privacy policy and imprint links but no "Contact Support" option. Users who hit billing issues, account access problems, or bugs have nowhere to turn in-app. They go to the App Store and leave a 1-star review instead.
- **Fix:** Add a `Linking.openURL('mailto:support@learnbuddy.app')` item to `about.tsx` under a "Support" section. Pre-fill subject line with app version: `mailto:support@learnbuddy.app?subject=LearnBuddy%20${Application.nativeApplicationVersion}%20Support`

**🔴 No FAQ or help content**

- **Where:** `app/(admin)/overview.tsx` — ROWS list
- **Problem:** Users can't self-serve. A link to a help page is enough to prevent frustrated users from churning.
- **Fix:** Add a "Help & FAQ" row to overview.tsx's ROWS array pointing to `Linking.openURL('https://learnbuddy.app/help')`.

---

### App Rating & Review — 🔴 Critical

**Overview:** No rating prompt is wired anywhere in the app. The App Store listing collects no ratings because users are never asked.

#### Findings

**🔴 No in-app rating prompt**

- **Where:** Nowhere — feature entirely missing
- **Problem:** Both App Store and Google Play have native review APIs with built-in frequency capping. Without them, the app collects no ratings. A polished edtech app with 0 reviews looks abandoned.
- **Fix:** After a session completes successfully, call the native review API. Install `expo-store-review` (`pnpm --filter @learnbuddy/mobile add expo-store-review`). In `result.tsx`, after `summaryQ.data` loads:

```tsx
import * as StoreReview from 'expo-store-review';

useEffect(() => {
  if (!summaryQ.data) return;
  void (async () => {
    const count = await getCompletedSessionCount(); // persist in SecureStore
    if (count >= 3 && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
    }
  })();
}, [summaryQ.data]);
```

The OS handles frequency capping (iOS: max 3 prompts/year). Never gate on positive sentiment first — that's review-gating and is explicitly banned by App Store Review Guidelines §5.6.1.

---

### Accessibility — 🟡 Needs Work

**Overview:** Standard components (Btn, BottomNav, LbTextInput) have full ARIA support. Several custom interactive patterns are missing roles and states. VoiceOver/TalkBack users can't understand tabs, checkboxes, or radio groups.

#### Findings

**🟡 welcome.tsx tab switcher — no role/state**

- **Where:** `app/(onboarding)/welcome.tsx` — the `Tab` function component
- **Problem:** Bare `Pressable` with no `accessibilityRole` or `accessibilityState`. VoiceOver announces nothing about tab selection.
- **Fix:**

```tsx
<Pressable
  accessibilityRole="tab"
  accessibilityState={{ selected: active }}
  accessibilityLabel={label}
  ...
>
```

**🟡 age-check.tsx year grid — no role/state**

- **Where:** `app/(onboarding)/age-check.tsx`
- **Problem:** Year buttons have no `accessibilityRole="radio"` and no `accessibilityState={{ selected: year === selectedYear }}`. VoiceOver hears a grid of numbers with no indication of selection.
- **Fix:** On each year Pressable, add `accessibilityRole="radio"`, `accessibilityState={{ selected: year === selectedYear }}`, `accessibilityLabel={String(year)}`.

**🟡 consent.tsx Checkbox — no role/state**

- **Where:** `app/(onboarding)/consent.tsx` — the custom `Checkbox` component
- **Problem:** No `accessibilityRole="checkbox"` and no `accessibilityState={{ checked: value }}`. VoiceOver announces it as an unlabeled interactive element.
- **Fix:** On the Checkbox `Pressable`: `accessibilityRole="checkbox"`, `accessibilityState={{ checked: value }}`, `accessibilityLabel={label}`.

**🟡 account-settings.tsx language selector — no role/state**

- **Where:** `app/(admin)/account-settings.tsx`
- **Problem:** Language Pressables lack `accessibilityRole` and `accessibilityState`, unlike `preferences.tsx`'s RadioRow which has them correctly. Inconsistency in the same app.
- **Fix:** Each language Pressable: `accessibilityRole="radio"`, `accessibilityState={{ selected: locale === currentLocale }}`, `accessibilityLabel={LOCALE_LABELS[locale]}`.

**🔵 index.tsx ActivityIndicator — no label**

- **Where:** `app/index.tsx`
- **Problem:** Screen readers announce "progress indicator" with no loading context.
- **Fix:** `<ActivityIndicator accessibilityLabel="Loading" />`.

**🔵 overview.tsx navigation rows — ambiguous role**

- **Where:** `app/(admin)/overview.tsx`
- **Problem:** Row Pressables with Link+asChild may or may not inherit a role. Add explicit `accessibilityRole="menuitem"` to be safe.
- **Fix:** `accessibilityRole="menuitem"` on each row Pressable.

---

### Forms & Validation — 🟡 Needs Work

**Overview:** All new forms are excellent. `reset-password.tsx` predates `LbTextInput` and uses a custom inline pattern.

#### Findings

**🟡 reset-password.tsx phase-2 password field uses custom inline pattern**

- **Where:** `app/reset-password.tsx` — new password input in phase 2
- **Problem:** Uses a custom `inputStyle` const and an inline `Icon` button positioned absolutely, instead of `LbTextInput` with `showToggle`. Inconsistent with every other password field. Will fall out of sync as `LbTextInput` evolves.
- **Fix:** Replace phase-2 TextInput + Icon block with:

```tsx
<LbTextInput
  ref={passwordRef}
  value={password}
  onChangeText={setPassword}
  placeholder={t('reset.new_placeholder')}
  secureTextEntry={!showPassword}
  textContentType="newPassword"
  returnKeyType="go"
  onSubmitEditing={onSavePassword}
  editable={!busy}
  showToggle
  shown={showPassword}
  onToggle={() => setShowPassword((v) => !v)}
  toggleAccessibilityLabel={showPassword ? t('reset.hide_password') : t('reset.show_password')}
/>
```

---

### Navigation & Flow — 🟡 Needs Work

**Overview:** Navigation is clean everywhere except a UX ambiguity and a silent failure on the result screen.

#### Findings

**🟡 result.tsx — dual CTA ambiguity + no error state**

- **Where:** `app/(learner)/result.tsx`
- **Problem 1:** Both "Review hard topics" and "Overview" CTAs call `router.replace('/(learner)/home')`. Same destination, different labels — confusing. "Review hard topics" should navigate to the practice hub.
- **Problem 2:** If `summaryQ.error` fires, the screen renders partial UI with no error branch and no retry. Silent failure.
- **Fix 1:** Change "Review hard topics" CTA to `router.replace('/(learner)/practice')`.
- **Fix 2:** Add error branch before the data render:

```tsx
if (summaryQ.error)
  return (
    <EmptyState glyph="⚠️" title={t('result:error_title')} body={t('result:error_body')}>
      <Btn size="sm" onPress={() => summaryQ.refetch()}>
        {t('common:actions.retry')}
      </Btn>
    </EmptyState>
  );
```

---

### What's New & Feature Introduction — 🟡 Needs Work

**Overview:** New users get coach marks. Returning users after an update get no context for what changed.

#### Findings

**🟡 No "What's New" modal for existing users**

- **Where:** `app/_layout.tsx`
- **Problem:** Every significant update ships silently. Returning users encounter changed UI with no explanation. Missed engagement opportunity.
- **Fix:** Persist the last-seen version in SecureStore. On mount, compare against `Application.nativeApplicationVersion`. If different and not first install, show a version-gated modal (same pattern as the force-update modal) with 3–5 key changes per release. Dismiss saves the current version. Modal shown once per version only.

---

### Advanced Security — 🟡 Needs Work

**Overview:** Baseline security is solid. One missing piece for an app serving minors.

#### Findings

**🟡 No app-switcher screen masking**

- **Where:** All screens — particularly home (shows learner name, subjects)
- **Problem:** iOS/Android take a screenshot for the app switcher. For an app serving minors, this leaks learner data to anyone who picks up the device.
- **Fix:** In `_layout.tsx`, listen to AppState and render a privacy overlay when backgrounded:

```tsx
const [isBackground, setIsBackground] = useState(false);
useEffect(() => {
  const sub = AppState.addEventListener('change', (s) => setIsBackground(s !== 'active'));
  return () => sub.remove();
}, []);

// In JSX (last child of GestureHandlerRootView):
{
  isBackground && (
    <View
      style={{ ...StyleSheet.absoluteFillObject, backgroundColor: LB.paper }}
      pointerEvents="none"
    />
  );
}
```

---

### In-App Purchases — 🟡 Needs Work

**Overview:** RevenueCat wired correctly. One item to verify.

#### Findings

**🟡 Verify subscription prices displayed from RevenueCat, not locale strings**

- **Where:** `app/(admin)/subscription.tsx`
- **Problem:** If pricing is shown from i18n locale strings (hardcoded), prices will be wrong for non-German users (currency, VAT, intro offer eligibility). RevenueCat's `getOfferings()` returns prices in the user's local currency — this is the correct source.
- **Fix:** Call `Purchases.getOfferings()` in `subscription.tsx` and use `offering.availablePackages[n].product.priceString` for display. Show a loading skeleton while fetching.

---

### Performance — 🟡 Needs Work

**Overview:** Skeleton loading, pull-to-refresh, and activity indicators all present. Image loading strategy unclear.

#### Findings

**🟡 Standard RN Image used — no fast image caching**

- **Where:** Photo thumbnails in capture.tsx photo strip; material thumbnails in folder/subject screens
- **Problem:** React Native's built-in `Image` has no persistent disk cache. Repeatedly loading the same photo URLs re-fetches on every render. `expo-image` provides LRU memory + disk cache, blurhash placeholders, and progressive loading.
- **Fix:** `pnpm --filter @learnbuddy/mobile add expo-image`. Replace `import { Image } from 'react-native'` with `import { Image } from 'expo-image'` in screens displaying uploaded material thumbnails. API is identical for basic usage.

---

### Rich Notifications — 🟡 Needs Work

**Overview:** Test reminders are scheduled correctly. Missing action buttons that would significantly improve engagement.

#### Findings

**🟡 No notification action buttons on test reminders**

- **Where:** `lib/notifications.ts` — `scheduleTestHeadsUp()`
- **Problem:** Test reminder notifications have no action buttons. A "Start practicing" button would let users jump to practice without unlocking the phone — much higher conversion to action.
- **Fix:** Add `categoryIdentifier: 'test_reminder'` to test reminder `scheduleNotificationAsync`. Register the category in `_layout.tsx` inside the existing Notifs setup block:

```tsx
Notifs.setNotificationCategoryAsync?.('test_reminder', [
  {
    identifier: 'practice',
    buttonTitle: i18n.t('common:notifications.action_practice'),
    options: { opensAppToForeground: true },
  },
]);
```

Handle `response.actionIdentifier === 'practice'` in `addNotificationResponseReceivedListener` → navigate to folder.

---

## Priority Fix List

| #   | Fix                                                                            | Where                             | Severity    | Effort |
| --- | ------------------------------------------------------------------------------ | --------------------------------- | ----------- | ------ |
| 1   | Add `expo-store-review` rating prompt after 3rd successful session             | `result.tsx`                      | 🔴 Critical | 30 min |
| 2   | Add support email + FAQ link to About/Overview                                 | `about.tsx`, `overview.tsx`       | 🔴 Critical | 15 min |
| 3   | `accessibilityRole="tab"` + `accessibilityState.selected` on tab switcher      | `welcome.tsx` Tab component       | 🟡 Medium   | 5 min  |
| 4   | `accessibilityRole="radio"` + `accessibilityState.selected` on year grid       | `age-check.tsx`                   | 🟡 Medium   | 10 min |
| 5   | `accessibilityRole="checkbox"` + `accessibilityState.checked` on checkboxes    | `consent.tsx` Checkbox            | 🟡 Medium   | 10 min |
| 6   | `accessibilityRole="radio"` + `accessibilityState.selected` on language picker | `account-settings.tsx`            | 🟡 Medium   | 10 min |
| 7   | Fix result.tsx: "Review" CTA → practice hub + add error state                  | `result.tsx`                      | 🟡 Medium   | 30 min |
| 8   | Migrate reset-password.tsx phase-2 password field to `LbTextInput`             | `reset-password.tsx`              | 🟡 Medium   | 20 min |
| 9   | App-switcher privacy overlay (absoluteFillObject when backgrounded)            | `_layout.tsx`                     | 🟡 Medium   | 20 min |
| 10  | Verify + fix subscription price display (RevenueCat getOfferings)              | `subscription.tsx`                | 🟡 Medium   | 1 hr   |
| 11  | Swap `Image` → `expo-image` for material thumbnails                            | capture.tsx, folder screens       | 🟡 Medium   | 1 hr   |
| 12  | Add "What's New" modal gated by stored app version                             | `_layout.tsx`                     | 🟡 Medium   | 2 hrs  |
| 13  | Add "Practice now" action button to test reminder notifications                | `_layout.tsx`, `notifications.ts` | 🟡 Medium   | 1 hr   |
| 14  | `accessibilityLabel` on cold-launch ActivityIndicator                          | `index.tsx`                       | 🔵 Low      | 5 min  |
| 15  | `accessibilityRole="menuitem"` on admin overview rows                          | `overview.tsx`                    | 🔵 Low      | 10 min |
| 16  | Shake-to-report via Sentry user feedback dialog                                | `_layout.tsx`                     | 🔵 Low      | 30 min |

---

## What's Working Well

**Toast system is excellent.** Zustand-backed, tone-correct, auto-dismiss, imperative API for non-React code, 14 mapped API error codes with action buttons (e.g., "Upgrade" on `insufficient_credits`). This is a real production feedback system.

**Auth flows are now complete.** Confirm password, strength meter, email format validation, show/hide toggle, keyboard chains, `textContentType` hints for password managers, "back to login" on conflict, forgot password — all present and correct.

**Zero hardcoded strings.** Every user-facing string goes through i18n across 5 locales (de, en, fr, es, it). This is rare and genuinely impressive.

**Offline detection is immediate.** The animated `OfflineBanner` detects connectivity loss within 1–2 seconds, shows a red banner with `accessibilityRole="alert"`, and auto-recovers without user action.

**Notifications are properly architected.** Daily nudges, streak reminders, test reminders with 3 time slots each, 30-day horizon filtering, foreground toast routing, permission rationale banner, notification preferences screen — this is well beyond what most apps ship.

**Force-update is wired end-to-end.** API `/version` endpoint, semver comparison, blocking non-dismissable modal with store URL. Clean implementation, implemented correctly (never blocks when offline).

**Privacy is genuinely respected.** PostHog EU-only with `disableGeoip`, no PII in analytics events, whitelisted event taxonomy. Sentry `sendDefaultPii: false`. SecureStore for all tokens. DSGVO export/delete in-app. Child accounts respected throughout. This matters for an app serving minors in Germany.

**Capture flow quality scoring is exceptional.** Laplacian variance + luminance + accelerometer tilt — three-axis quality assessment on uploaded learning photos is genuinely impressive. The red-candidate modal + "keep anyway" flow is exactly right.
