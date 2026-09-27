// Renders LearnBuddy's app icon, Android adaptive layers, favicon and splash
// image from the SVG drawn here (Buddy's orb, "Pastell Soft"): our own art,
// nothing downloaded. Chromium draws each SVG at its exact pixel size.
//
//   node scripts/brand/render-icons.mjs [outDir]   (default apps/mobile/assets)
//
// The palette follows apps/mobile/lib/theme/colors.ts and components/lb/BuddyOrb.tsx.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const out = resolve(process.argv[2] ?? 'apps/mobile/assets');

const BG = '#faf7fd';
const VIOLET = '#6a48d7';

/** The soft pastel light (blue · lilac · pink) behind the orb, as in components/lb/Glow.tsx. */
function backdrop() {
  return `
    <defs>
      <linearGradient id="bgBase" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e3e9ff"/>
        <stop offset="0.5" stop-color="#eee5ff"/>
        <stop offset="1" stop-color="#fde3f0"/>
      </linearGradient>
      <radialGradient id="bgBlue" cx="0.08" cy="0.2" r="0.62">
        <stop offset="0" stop-color="#b8cbff" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#b8cbff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="bgPink" cx="0.95" cy="0.9" r="0.62">
        <stop offset="0" stop-color="#ffc3df" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#ffc3df" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="bgLilac" cx="0.72" cy="0.05" r="0.5">
        <stop offset="0" stop-color="#d7c5ff" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#d7c5ff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bgBase)"/>
    <rect width="1024" height="1024" fill="url(#bgBlue)"/>
    <rect width="1024" height="1024" fill="url(#bgLilac)"/>
    <rect width="1024" height="1024" fill="url(#bgPink)"/>`;
}

/**
 * Buddy's orb, centred at (cx, cy) with radius r: a glass sphere lit from the
 * upper left — blue → lilac → pink body, a white rim, a soft shine and one
 * crisp highlight, a violet depth at the lower edge and a halo of white light.
 */
function orb(cx, cy, r, { halo = true, shadow = true } = {}) {
  const k = r / 330; // drawn at r = 330, scaled
  return `
    <defs>
      <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="0.75" stop-color="#ffffff" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="body" x1="0.12" y1="0.08" x2="0.9" y2="0.95">
        <stop offset="0" stop-color="#a9bfff"/>
        <stop offset="0.42" stop-color="#bba6fb"/>
        <stop offset="0.78" stop-color="#eaa6d6"/>
        <stop offset="1" stop-color="#f7bcdc"/>
      </linearGradient>
      <radialGradient id="depth" cx="0.42" cy="0.34" r="0.74">
        <stop offset="0.6" stop-color="${VIOLET}" stop-opacity="0"/>
        <stop offset="0.9" stop-color="${VIOLET}" stop-opacity="0.26"/>
        <stop offset="1" stop-color="${VIOLET}" stop-opacity="0.42"/>
      </radialGradient>
      <radialGradient id="shine" cx="0.36" cy="0.28" r="0.52">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.38"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="bounce" cx="0.66" cy="0.86" r="0.34">
        <stop offset="0" stop-color="#fff4fb" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#fff4fb" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="rim" x1="0.25" y1="0" x2="0.75" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.25"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/>
      </linearGradient>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${30 * k}"/>
      </filter>
      <filter id="edge" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${9 * k}"/>
      </filter>
      <filter id="blurHi" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${4 * k}"/>
      </filter>
      <clipPath id="sphere"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    </defs>
    ${halo ? `<circle cx="${cx}" cy="${cy}" r="${r * 1.34}" fill="url(#halo)"/>` : ''}
    ${
      shadow
        ? `<ellipse cx="${cx + r * 0.04}" cy="${cy + r * 0.92}" rx="${r * 0.74}" ry="${r * 0.17}"
             fill="${VIOLET}" fill-opacity="0.26" filter="url(#soft)"/>`
        : ''
    }
    <g clip-path="url(#sphere)">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#body)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#depth)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shine)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bounce)"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 4 * k}" fill="none" stroke="#ffffff" stroke-opacity="0.7"
        stroke-width="${16 * k}" filter="url(#edge)"/>
      <ellipse cx="${cx - r * 0.36}" cy="${cy - r * 0.46}" rx="${r * 0.17}" ry="${r * 0.085}"
        transform="rotate(-36 ${cx - r * 0.36} ${cy - r * 0.46})"
        fill="#ffffff" fill-opacity="0.92" filter="url(#blurHi)"/>
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r - 2.5 * k}" fill="none" stroke="url(#rim)" stroke-width="${5 * k}"/>`;
}

/** Android's themed (monochrome) icon: the orb's silhouette with its highlight cut out. */
function monochrome() {
  const cx = 512;
  const cy = 512;
  const r = 250;
  return `
    <defs>
      <mask id="cut">
        <rect width="1024" height="1024" fill="#fff"/>
        <ellipse cx="${cx - r * 0.34}" cy="${cy - r * 0.42}" rx="${r * 0.24}" ry="${r * 0.13}"
          transform="rotate(-34 ${cx - r * 0.34} ${cy - r * 0.42})" fill="#000"/>
        <circle cx="${cx}" cy="${cy}" r="${r - 34}" fill="none" stroke="#000" stroke-width="14"/>
      </mask>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#000" mask="url(#cut)"/>`;
}

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

const FILES = [
  // iOS / store icon: full bleed, opaque (iOS rounds the corners itself).
  { name: 'icon.png', size: 1024, body: backdrop() + orb(512, 500, 326), opaque: true },
  // Android adaptive: the layers are 108 dp; only the inner 66 dp circle is always shown.
  { name: 'adaptive-foreground.png', size: 1024, body: orb(512, 506, 232) },
  { name: 'adaptive-background.png', size: 1024, body: backdrop(), opaque: true },
  { name: 'adaptive-monochrome.png', size: 1024, body: monochrome() },
  // Splash: the orb alone on the page colour (drawn transparent, placed on BG).
  { name: 'splash-icon.png', size: 1024, body: orb(512, 500, 330) },
  // Web.
  { name: 'favicon.png', size: 48, body: orb(512, 512, 430, { halo: false, shadow: false }) },
];

// The sandbox ships Chromium at /opt/pw-browsers (as in playwright.config.ts).
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath:
    process.env.LB_CHROMIUM ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
});
const page = await browser.newPage({ deviceScaleFactor: 1 });
await mkdir(out, { recursive: true });
for (const f of FILES) {
  await page.setViewportSize({ width: f.size, height: f.size });
  await page.setContent(
    `<html><body style="margin:0;background:${f.opaque ? BG : 'transparent'}">${svg(
      f.size,
      f.body,
    )}</body></html>`,
  );
  const png = await page.screenshot({
    omitBackground: !f.opaque,
    clip: { x: 0, y: 0, width: f.size, height: f.size },
  });
  await writeFile(resolve(out, f.name), png);
  console.log(`${f.name} ${f.size}×${f.size}`);
}
await browser.close();
