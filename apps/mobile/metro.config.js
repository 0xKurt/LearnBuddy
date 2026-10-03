// `getSentryExpoConfig` is Expo's own default config plus one thing: a debug id stamped
// into every bundle and its source map, so a crash report can be read as real file names
// instead of minified noise (issue #36). It needs no account and no token — without the
// Sentry build plugin (app.config.ts, only with SENTRY_ORG/SENTRY_PROJECT set) nothing is
// uploaded and the id is simply unused. NativeWind wraps it below; it touches the
// transformer, not the serializer, so the two do not collide.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const { assertClientEnvClean } = require('./scripts/client-secrets.cjs');

// No secret may reach the bundle (issue #290): every EXPO_PUBLIC_* variable — from the shell,
// or from an .env file Expo loads — is checked here, before Metro serves or exports anything.
// This config is loaded by `expo start`, `expo export` and EAS builds alike.
assertClientEnvClean({ projectRoot });

const config = getSentryExpoConfig(projectRoot);

// Workspace support: let Metro look up packages in the monorepo root.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// SDK 54 / Metro 0.83 + pnpm: leave hierarchical lookup ENABLED so that the
// project's own node_modules under apps/mobile/ is consulted first. Disabling
// it caused Metro to resolve the bundle entry from the workspace root.

// SDK 54 / Metro 0.83 stopped auto-rewriting `.js` import paths to their
// `.ts`/`.tsx` source files. The codebase uses NodeNext-style relative
// imports (`'../lib/foo.js'`) because that's what TypeScript's strict ESM
// mode requires. Intercept those at resolution time and try the
// extension-less name (which falls through Metro's normal sourceExts).
const defaultResolveRequest = config.resolver.resolveRequest;
// Expo's dev-only `expo/virtual/env` bundles the project's .env files as modules and lets them
// win over the shell, even with EXPO_NO_DOTENV=1 (issue #291, measured on the served bundle).
// The dev bundle reads `process.env` instead — what Metro's own environment says (lib/processEnv.ts).
const processEnv = path.resolve(projectRoot, 'lib/processEnv.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo/virtual/env') {
    return { type: 'sourceFile', filePath: processEnv };
  }
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to default
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
