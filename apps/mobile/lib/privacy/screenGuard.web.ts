// A browser has no FLAG_SECURE and no screenshot block: the operating system decides, and
// no page can stop it. So this is honestly a no-op rather than a promise we cannot keep
// (docs/privacy.md). The export must exist — the conversation screens call it, and a
// missing export on the web once crashed a whole screen (lib/speech/recognize.web.ts).

export type GuardedScreen = 'buddy' | 'talk' | 'history' | 'practice';

export function useScreenGuard(_screen: GuardedScreen): void {}
