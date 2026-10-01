import { transformWithEsbuild } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';

const here = (file: string): string => new URL(file, import.meta.url).pathname;

/** Packages that publish source Metro is expected to transform, rather than plain JS. */
const RN_PACKAGE = /node_modules[\\/](\.pnpm[\\/])?(@?expo|react-native|@react-native)/;
/** An opening or closing tag — `i < n` and `a <= b` do not look like this. */
const LOOKS_LIKE_JSX = /<\/?[A-Z][\w.]*[\s/>]|<\/[a-z][\w.]*>/;

/**
 * Expo publishes `.js` files with JSX still in them, because Metro transforms node_modules
 * and bundlers that do not are not its problem (expo-clipboard/build/ClipboardPasteButton.js,
 * expo-router's whole build directory). Vite hands a `.js` file to esbuild's JS loader, which
 * stops at the first `<`. These get the JSX loader instead — the same thing Metro does for
 * them, nothing more.
 */
function jsxInPublishedJs(): Plugin {
  return {
    name: 'lb-jsx-in-published-js',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.js') || !RN_PACKAGE.test(id) || !LOOKS_LIKE_JSX.test(code)) return null;
      return transformWithEsbuild(code, id, {
        loader: 'jsx',
        jsx: 'automatic',
        jsxImportSource: 'react',
      });
    },
  };
}

/**
 * `expo/src/Expo.ts` opens with `import './Expo.fx'`, which installs Expo Go's development
 * runtime: fast refresh, the `import.meta` registry, the async-require hook. Those modules
 * reach for relative `require('./X')` inside `.ts` files — only Metro resolves that, Node
 * cannot, and the import fails before a component renders. None of it has anything to do
 * with what a component puts on screen, so it is left out; everything the root entry
 * actually exports (`useEvent` for expo-audio and expo-notifications, `isRunningInExpoGo`
 * for expo-splash-screen) is the real thing.
 */
function withoutExpoDevRuntime(): Plugin {
  return {
    name: 'lb-without-expo-dev-runtime',
    enforce: 'pre',
    load(id) {
      return /expo[\\/]src[\\/]Expo\.fx(\.\w+)?\.[jt]sx?$/.test(id) ? 'export {};' : null;
    },
  };
}

/**
 * What metro.config.js does for the real web build, done once more here.
 *
 * The codebase writes relative imports with a `.js` extension (`'../lib/foo.js'`) because
 * TypeScript's strict ESM mode requires it, while the file on disk is `foo.ts`. Vite rewrites
 * such a path to `foo.ts` itself — but that rewrite is a straight swap and never looks at
 * `resolve.extensions`, so a `.web.ts` twin is skipped and the phone's file is loaded instead
 * (lib/api/streamingFetch.web.ts, lib/theme/systemChrome.web.ts, lib/api/outboxStorage.web.ts).
 * Resolving the extension-less name first lets the `.web.*` entries win, exactly as Metro's
 * own `resolveRequest` hook arranges it.
 */
function webTwinsFirst(): Plugin {
  return {
    name: 'lb-web-twins-first',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      if (!source.startsWith('./') && !source.startsWith('../')) return null;
      if (!source.endsWith('.js')) return null;
      const found = await this.resolve(source.slice(0, -3), importer, {
        ...options,
        skipSelf: true,
      });
      return found ?? null;
    },
  };
}

// Component tests (docs/testing-layers.md). Between the pure-logic tests in `lib/**` and
// the browser walkthrough there was nothing: a screen's states — a refused microphone, a
// failed upload, a long label, a palette switched while she looks at it — were only ever
// reachable by building the web bundle, starting the API and driving Chromium, and some of
// them not even there.
//
// Components render through **react-native-web**, the same engine the walkthrough's web
// build uses, so what passes here matches what that run sees. What this layer can and
// cannot see is written down in docs/testing-layers.md — in short: it sees what is
// rendered, with which props, labels, roles and declared styles, and it is blind to
// geometry (jsdom lays nothing out) and to anything only a real device does.
export default defineConfig({
  // Two globals Metro and Babel inline into the real bundle, and nothing defines under a bare
  // Node runtime — without them expo-modules-core throws at import. `__DEV__` is **false**
  // because true switches on Expo's development-only code paths, which reach for modules that
  // cannot be loaded here; the consequence for lib/env.ts is handled under `test.env` below.
  define: { __DEV__: 'false', 'process.env.EXPO_OS': JSON.stringify('web') },
  // The app's JSX runs through Babel with `jsxImportSource: 'nativewind'` (babel.config.js);
  // here the plain React runtime is enough — these tests read rendered output, not classNames.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  plugins: [webTwinsFirst(), jsxInPublishedJs(), withoutExpoDevRuntime()],
  resolve: {
    alias: [
      // Exactly `react-native`, never `react-native-svg`: that one resolves its own web
      // build through the `.web.*` extensions below.
      { find: /^react-native$/, replacement: 'react-native-web' },
      // Reanimated 4 needs its Babel plugin to have rewritten both the app and itself into
      // worklets; without that pass it throws at import. The stand-in says what it does and
      // does not cover (testing/reanimated.tsx).
      { find: /^react-native-reanimated$/, replacement: here('./testing/reanimated.tsx') },
      // expo-router ships JSX inside `.js` files (Metro transforms node_modules, Node does
      // not), so neither Node nor Vite can load it here. testing/expo-router.ts records
      // where the app asked to go instead.
      { find: /^expo-router$/, replacement: here('./testing/expo-router.ts') },
    ],
    // Metro's web resolution, as far as it matters here: a `.web.*` twin wins (the app has
    // several), and a package is entered through its ESM build so its own `.web.js` files
    // are picked up too (react-native-svg resolves its web elements that way).
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    mainFields: ['module', 'browser', 'main'],
  },
  test: {
    name: 'components',
    environment: 'jsdom',
    include: ['components/**/__tests__/*.test.tsx'],
    globals: false,
    setupFiles: ['./testing/components.setup.ts'],
    // `__DEV__: false` makes lib/env.ts read this as a release build, and a release build
    // refuses to start unconfigured rather than quietly talking to localhost with a fake key
    // (p2-uf-prod-build-silent-localhost-fallback). So it is configured — at the local stack,
    // the same values scripts/web-walkthrough.sh exports. The guard stays real.
    env: {
      EXPO_PUBLIC_API_URL: 'http://localhost:8787',
      EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:8787',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'dev-anon-key',
    },
    // The React Native and Expo packages must go through Vite's pipeline. Left external,
    // Node requires them directly and dies on the first thing it cannot parse — Flow types
    // in react-native's source, JSX in Expo's published `.js` files.
    server: { deps: { inline: true } },
  },
});
