# Web press configuration at commit — #563

A failed Reset resend can leave the visible retry action enabled while React Native Web's persistent PressResponder still carries the previous disabled configuration. Its configure effect originally runs passively, after DOM commit. A click in that interval is rejected before the actual Reset request handler runs. This is a shared web press lifecycle issue; recovery parsing, requests and account privacy do not change.

## Evidence

The mounted Reset regression uses the real application providers, fields and press controls with the existing external auth-adapter seam. A deferred request rejects with AuthFailure(network); a MutationObserver reacts to the actual button's enabled DOM commit and dispatches a retry. Unpatched main41b fails confirmation. Diagnostic runtime tracing records connected=true/aria-disabled absent, cached disabled=true and only one adapter call; configure(false) follows the discarded click. With the patch the clean regression passes and verifies two exact trimmed-address calls and generic confirmation. The nine existing recovery tests remain intact, including same-render Enter fences, generic known/unknown outcomes, network/rate-limit retry, leaving, link and password/cache semantics.

The stock isolated and related diagnostic runs passed; their original failing chronology was not captured. The deterministic regression demonstrates the same lost-retry mechanism without claiming that every earlier timeout has been independently attributed. Diagnostic instrumentation is not shipped.

## Bounded patch

The existing pnpm patchedDependencies workflow pins a patch to react-native-web0.21.2. Its source, shipped ESM and shipped CommonJS usePressEvents entries configure via the package's existing isomorphic useLayoutEffect helper. Browser configuration therefore updates during commit before observer/event delivery; on the server the helper uses useEffect. Unmount reset remains a separate passive effect. No version upgrade, new dependency, app callback/state/provider/credential change or native React Native patch is introduced. Lockfile peer snapshots change only to carry the patch hash.

Frozen installation succeeds; the actual ESM component suite passes10/10. Logs: `/tmp/learnbuddy-reset-clean-boundary-red.log`, `/tmp/learnbuddy-reset-boundary-trace.log`, `/tmp/learnbuddy-reset-patch-green.log` and `/tmp/learnbuddy-rnweb-patch-frozen.log`. Independent source/regression review accepted the minimal three-entry patch. CommonJS package/main import and SSR Pressable rendering pass without browser globals. Actual local Reset browser coverage passes6/6 in1.1m: four appearances at both phones with fit/44px/axe, a genuinely offline request preserving email and retrying after reconnection, and generic confirmation for an existing local account. Isolated PG15432/API18797/web18091 and DevAuth are used; no external recovery provider is called. Durable artifacts: learnbuddy-redesign/reset-retry-patch/results, plus `/tmp/learnbuddy-reset-patch-browser-artifacts`; log `/tmp/learnbuddy-reset-patch-browser.log`. No rendering source or browser assertion was changed for this run.

## Limits and maintenance

Native React Native0.81.5 also configures Pressability passively. An early native analogy was corrected in issue563; this fix addresses demonstrated web behavior only. Native event timing and physical-device behavior are unaffected and unverified. The auth seam tests do not prove actual email delivery. Real local DevAuth/browser tests do not call external credentials/providers.

On a future react-native-web upgrade, inspect its configuration lifecycle and remove this patch only when the clean enabled-boundary regression passes against the genuine replacement. Keep the version-specific patch and shipped entry points consistent; do not edit shared installed package/store files manually.
