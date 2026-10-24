// Records a ~12 s screen capture of the dummy app (dummy/app.html) with Playwright, the same way
// the CI walkthrough will record the real app: one webm, 390×844.
//   node dummy/make-dummy.mjs [--out dummy/app.webm] [--scale 1]
// --scale 2 records at deviceScaleFactor 2 into a 780×1688 webm (sharper in the phone frame).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(here, 'app.webm')));
const scale = Number(arg('--scale', '1'));

const W = 390, H = 844;
const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.rec-'));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: scale,
  recordVideo: { dir: tmp, size: { width: W * scale, height: H * scale } },
});
const page = await context.newPage();
// The recording starts with the page; marks are measured from here (≈ video time).
const t0 = Date.now();
const marks = [];
const mark = (name) => { marks.push({ name, ms: Date.now() - t0 }); };
const until = async (ms) => { const d = ms - (Date.now() - t0); if (d > 0) await page.waitForTimeout(d); };

await page.goto(pathToFileURL(path.join(here, 'app.html')).href);
await page.evaluate(() => document.fonts.ready);
mark('loaded');

// Scene 1: type a message, send it, Buddy answers and enters the test.
await until(900);
await page.click('#msg'); mark('tap composer');
await page.keyboard.type('Am Donnerstag schreiben wir Mathe. Brüche!', { delay: 42 });
await until(3000);
await page.click('#send'); mark('send');
await until(4700);
await page.click('#practiceBtn'); mark('tap Jetzt üben');

// Scene 2: answer a practice question.
await until(6000);
await page.click('#optA'); mark('tap 3/4');
await until(7900);
await page.click('#next'); mark('tap Weiter');

// Scene 3: scroll through the week.
await until(8900);
await page.mouse.move(195, 500);
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(110); }
mark('scrolled');
await until(11000);
await page.mouse.click(195, 300); mark('tap item');
await until(12600);
mark('end');

const video = page.video();
await context.close();
await video.saveAs(out);
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
for (const m of marks) console.log(String(m.ms).padStart(6), 'ms ', m.name);
