const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Workspace support: let Metro look up packages in the monorepo root.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// SDK 54 / Metro 0.83 + pnpm: leave hierarchical lookup ENABLED so that the
// project's own node_modules under apps/mobile/ is consulted first. Disabling
// it caused Metro to resolve the bundle entry from the workspace root.

module.exports = withNativeWind(config, { input: './global.css' });
