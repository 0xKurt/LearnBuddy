// The platform's own monospace face for code (issue #262, `TYPE.code`): no font file to ship, and
// every phone has one. Android's generic family; iOS and the browser have their twins
// (`monospace.ios.ts`, `monospace.web.ts`), picked by the bundler — no React Native import here, so
// the theme stays loadable under the Node tests.
export const MONOSPACE = 'monospace';
