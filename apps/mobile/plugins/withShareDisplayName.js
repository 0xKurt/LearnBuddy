// The iOS share extension from expo-share-intent names itself after its Xcode target
// ("LearnBuddyShare": it may not be the app target's name). In the share sheet it should
// just say "LearnBuddy": this sets the extension's CFBundleDisplayName after the
// extension files are written (docs/architecture.md §Material).
const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withShareDisplayName(config, { target, displayName }) {
  return withXcodeProject(config, (cfg) => {
    const plist = path.join(
      cfg.modRequest.platformProjectRoot,
      target,
      'ShareExtension-Info.plist',
    );
    if (fs.existsSync(plist)) {
      const xml = fs.readFileSync(plist, 'utf8');
      const next = xml.replace(
        /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
        `$1${displayName}$2`,
      );
      fs.writeFileSync(plist, next);
    } else {
      console.warn(`[withShareDisplayName] ${plist} not found: display name not set`);
    }
    return cfg;
  });
};
