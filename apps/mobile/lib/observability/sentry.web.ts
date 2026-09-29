// In the browser the app is the scripted walkthrough (tests/web) and a developer's tab:
// there is no native crash handler to install and nothing to report, so crash reporting
// stays off here. The exports must still exist — `app/_layout.tsx` and the render
// boundary call them, and a missing export on the web once crashed a whole screen
// (lib/speech/recognize.web.ts).
//
// The EU check on the DSN is *not* skipped here: it runs in `lib/env.ts`, which the web
// bundle loads like every other platform.

export function startCrashReports(): void {}

export function reportCrash(_error: unknown, _where: string): void {}
