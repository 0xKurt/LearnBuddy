// Writes apps/mobile/public/index.html — the page the browser gets before any of the app
// has run. Expo reads an index.html from the public folder in preference to its own
// template (`@expo/cli` → `getTemplateIndexHtmlAsync`), so this is the one place where a
// line can run before the first paint.
//
// Why it exists: the browser painted its own white, then the bundle loaded, then
// `restoreTheme()` applied her palette. Three steps, and the owner filmed the middle one —
// "~0,3 s weiße Fläche" before the app appeared (issue #194). On the light palettes nobody
// notices; on the night palette it is a white flash in a dark room.
//
// Generated rather than hand-written for one reason: the colours must come from
// `lib/theme/palettes.ts` and nowhere else. A second copy of a colour is issue #84, and
// `lib/theme/__tests__/webShell.test.ts` fails if this file is stale — refresh it with
// `node scripts/write-web-shell.mjs` from apps/mobile.

export function shellHtml(grounds, families, defaultMode) {
  // Inline and synchronous on purpose: a separate file or a deferred script would run
  // after the browser has already shown something.
  const paint = `(function(){try{
var grounds=${JSON.stringify(grounds)};
var families=${JSON.stringify(families)};
var family=localStorage.getItem('lb.theme');
var mode=localStorage.getItem('lb.themeMode');
if(family==='night'){family='pastell';mode='dark';}
if(families.indexOf(family)<0)family='pastell';
if(mode!=='light'&&mode!=='dark')mode=${JSON.stringify(defaultMode)};
var dark=mode==='dark'||(mode==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.style.backgroundColor=grounds[dark?family+'Dark':family]||grounds.pastell;
}catch(e){}})();`;
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>LearnBuddy</title>
    <script>${paint}</script>
    <style id="expo-reset">
      html,
      body {
        height: 100%;
      }
      body {
        overflow: hidden;
        background: transparent;
      }
      #root {
        display: flex;
        height: 100%;
        flex: 1;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
}
