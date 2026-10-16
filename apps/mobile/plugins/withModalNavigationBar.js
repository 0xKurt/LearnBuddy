// The system navigation bar under an open sheet (issue #177). Every sheet is a React Native
// `Modal`, and on Android a Modal is a window of its own: `expo-navigation-bar` styles the
// Activity's window, never this one. Measured on the POCO X3 (01.10.2026): the bar under a sheet
// is drawn by the system, outside our view tree, and in dark mode it is a light contrast scrim
// with dark icons.
//
// React Native gives that window the theme `Theme.FullScreenDialog` (react-native
// ReactAndroid/src/main/res/views/modal/values/themes.xml). An app resource of the same name
// replaces the library's, so this plugin writes it again — React Native's five items unchanged —
// with the navigation bar made transparent, its contrast scrim off and its icons following day
// and night (`values-v29` / `values-night-v29`). With `navigationBarTranslucent` on the Modal the
// sheet's own surface then fills the bar. Night follows the system setting: a native window
// cannot know the app's own theme choice. Takes effect with the next native build.
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/** The resource file this plugin owns, in each qualifier directory. */
const FILE = 'lb_modal_navigation_bar.xml';

/** React Native's own items of Theme.FullScreenDialog, kept as they are. */
const RN_ITEMS = [
  ['android:windowNoTitle', 'true'],
  ['android:windowIsFloating', 'false'],
  ['android:windowBackground', '@android:color/transparent'],
  ['android:windowDrawsSystemBarBackgrounds', 'true'],
  ['android:statusBarColor', '@android:color/transparent'],
];

/** The theme of a Modal's window, for day (`night` false) or night. */
function modalThemeXml(night) {
  const items = [
    ...RN_ITEMS,
    ['android:navigationBarColor', '@android:color/transparent'],
    ['android:enforceNavigationBarContrast', 'false'],
    ['android:windowLightNavigationBar', night ? 'false' : 'true'],
  ];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withModalNavigationBar.js (issue #177); do not edit. -->',
    '<resources>',
    '  <style name="Theme.FullScreenDialog">',
    ...items.map(([name, value]) => `    <item name="${name}">${value}</item>`),
    '  </style>',
    '</resources>',
    '',
  ].join('\n');
}

function withModalNavigationBar(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const [dir, night] of [
        ['values-v29', false],
        ['values-night-v29', true],
      ]) {
        fs.mkdirSync(path.join(res, dir), { recursive: true });
        fs.writeFileSync(path.join(res, dir, FILE), modalThemeXml(night));
      }
      return cfg;
    },
  ]);
}

module.exports = withModalNavigationBar;
module.exports.modalThemeXml = modalThemeXml;
module.exports.RN_ITEMS = RN_ITEMS;
