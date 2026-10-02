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
/** Optional: render only these files (comma-separated names), e.g. `ONLY=icon-dark.png`. */
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const BG = '#faf7fd';
const VIOLET = '#6a48d7';

/**
 * The night: the default family's dark ground and the coloured, far fainter light Buddy
 * wears on it (apps/mobile/lib/theme/palettes.ts → `night.bg`, `night.buddyLight.halo`,
 * issue #139). White light was made for the pastel page and is a near-white disc on this one.
 */
const NIGHT_BG = '#191627';
const NIGHT = {
  halo: { color: '#c3aeff', opacity: 0.4 },
  shadow: { color: '#000000', opacity: 0.45 },
};

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
function orb(cx, cy, r, { halo = true, shadow = true, night = false } = {}) {
  const k = r / 330; // drawn at r = 330, scaled
  // At night the halo takes the in-app falloff (components/lb/BuddyOrb.tsx → Halo): no flat
  // plateau and step, which reads as a hard edge on a dark ground.
  const haloStops = night
    ? [
        [0.4, 1],
        [0.66, 0.42],
        [0.85, 0.12],
        [1, 0],
      ]
        .map(
          ([o, f]) =>
            `<stop offset="${o}" stop-color="${NIGHT.halo.color}" stop-opacity="${NIGHT.halo.opacity * f}"/>`,
        )
        .join('')
    : `<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="0.75" stop-color="#ffffff" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>`;
  const cast = night ? NIGHT.shadow : { color: VIOLET, opacity: 0.26 };
  return `
    <defs>
      <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
        ${haloStops}
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
             fill="${cast.color}" fill-opacity="${cast.opacity}" filter="url(#soft)"/>`
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

/**
 * Buddy's moon (lib/buddy/moon.ts): the still pose of "listen" as the prototype's icons
 * use it — parked at the upper right of the orb, in front, glowing. Orb units (radius 54).
 * The icon draws it `boost` × its size (the prototype used 2.1; the owner asked for a
 * clearly smaller moon, docs/DESIGN-BRIEF.md §Buddy's moon).
 */
const MOON_POSE = { x: 71.13, y: -38.03, scale: 1.394, glow: 1.21 };

/** The moon for an orb centred at (cx, cy) with radius r; `boost` enlarges only the moon. */
function moon(cx, cy, r, boost, { glow = true, reflection = true } = {}) {
  const k = r / 54;
  const mx = cx + MOON_POSE.x * k;
  const my = cy + MOON_POSE.y * k;
  const s = MOON_POSE.scale * boost * k;
  const g = 0.8 + Math.min(MOON_POSE.glow, 1.3) * 0.4;
  const dist = Math.hypot(MOON_POSE.x, MOON_POSE.y);
  const nx = MOON_POSE.x / dist;
  const ny = MOON_POSE.y / dist;
  const near = Math.min(1, Math.max(0, 1 - (dist - 54) / 40));
  const rx = cx + nx * 45 * k;
  const ry = cy + ny * 45 * k;
  const rot = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
  return `
    <defs>
      <radialGradient id="mglow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset="0.3" stop-color="#fbeaff" stop-opacity="0.75"/>
        <stop offset="0.62" stop-color="#e6c9ff" stop-opacity="0.32"/>
        <stop offset="1" stop-color="#dcc4ff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="mpearl" cx="0.36" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.55" stop-color="#fdf0fa"/>
        <stop offset="1" stop-color="#d9c3fa"/>
      </radialGradient>
      <clipPath id="mclip"><circle r="8.6"/></clipPath>
      <filter id="mshade" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1"/>
      </filter>
      <filter id="mrefl" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="${2.2 * k}"/>
      </filter>
    </defs>
    ${
      reflection
        ? `<g clip-path="url(#sphere)"><ellipse cx="${rx}" cy="${ry}" rx="${6 * k}" ry="${4 * k}"
             transform="rotate(${rot} ${rx} ${ry})" fill="#ffffff"
             opacity="${near * (0.45 + MOON_POSE.glow * 0.3)}" filter="url(#mrefl)"/></g>`
        : ''
    }
    <g transform="translate(${mx} ${my}) scale(${s})">
      ${glow ? `<circle r="21" fill="url(#mglow)" transform="scale(${g})"/>` : ''}
      <circle r="8.6" fill="url(#mpearl)"/>
      <g clip-path="url(#mclip)">
        <circle cx="5.2" cy="4.2" r="8.2" fill="#a98cf0" fill-opacity="0.5" filter="url(#mshade)"/>
      </g>
      <circle r="8.6" fill="none" stroke="#b89ff2" stroke-opacity="0.55" stroke-width="0.8"/>
      <circle cx="-2.8" cy="-3" r="2.3" fill="#ffffff" fill-opacity="0.95"/>
    </g>`;
}

/** Android's themed (monochrome) icon: the orb's silhouette with its highlight cut out. */
function monochrome() {
  const [cx, cy, r] = ADAPTIVE;
  const k = r / 54;
  const mx = cx + MOON_POSE.x * k;
  const my = cy + MOON_POSE.y * k;
  const mr = 8.6 * MOON_POSE.scale * BOOST * k;
  // The moon as a crescent (its shade cut away), so the pair never reads as a camera.
  return `
    <defs>
      <mask id="cut">
        <rect width="1024" height="1024" fill="#fff"/>
        <ellipse cx="${cx - r * 0.34}" cy="${cy - r * 0.42}" rx="${r * 0.24}" ry="${r * 0.13}"
          transform="rotate(-34 ${cx - r * 0.34} ${cy - r * 0.42})" fill="#000"/>
        <circle cx="${mx + mr * 0.5}" cy="${my + mr * 0.42}" r="${mr * 0.95}" fill="#000"/>
      </mask>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#000" mask="url(#cut)"/>
    <circle cx="${mx}" cy="${my}" r="${mr}" fill="#000" mask="url(#cut)"/>`;
}

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

/** The moon's size in the icons: 0.6 of the prototype's ×2.1 (the owner found that too big),
 * so it still reads at 48 px while the orb leads. */
const BOOST = Number(process.env.LB_MOON_BOOST ?? 1.3);

// The orb moves a little down and left to make room for its moon at the upper right.
const ICON = [470, 540, 290];
const ADAPTIVE = [495, 528, 190];
const FAVICON = [440, 580, 300];
// The splash shows the whole picture: small enough that the moon's glow (the widest part,
// mx + 21·scale·glow ≈ cx + 633 at this size) fades out inside the 1024 canvas instead of
// being cut off at the edge.
const SPLASH = [386, 540, 285];

const FILES = [
  // iOS / store icon: full bleed, opaque (iOS rounds the corners itself).
  {
    name: 'icon.png',
    size: 1024,
    body: backdrop() + orb(...ICON) + moon(...ICON, BOOST),
    opaque: true,
  },
  // Android adaptive: the layers are 108 dp; only the inner 66 dp circle is always shown.
  {
    name: 'adaptive-foreground.png',
    size: 1024,
    body: orb(...ADAPTIVE) + moon(...ADAPTIVE, BOOST),
  },
  { name: 'adaptive-background.png', size: 1024, body: backdrop(), opaque: true },
  { name: 'adaptive-monochrome.png', size: 1024, body: monochrome() },
  // Splash: the orb and its moon baked opaque on the page colour. Opaque on purpose:
  // Android's splash renderer (MIUI at least) composites straight-alpha PNGs wrongly and
  // turns the soft glow into gray fringes — with the background baked in there is no alpha
  // to get wrong, and the native window colour is the same #faf7fd, so the square is
  // invisible. components/lb/SplashHandoff.tsx shows the same picture on the same colour.
  {
    name: 'splash-icon.png',
    size: 1024,
    body: orb(...SPLASH) + moon(...SPLASH, BOOST),
    opaque: true,
  },
  // The same picture baked on the night ground, for a phone in dark mode (issue #194):
  // expo-splash-screen's `dark` variant, with the window colour `NIGHT_BG` behind it. The
  // native splash only knows the phone's light/dark — never her colour family — so it is the
  // default family's night; components/lb/SplashHandoff.tsx takes over in her own palette.
  {
    name: 'splash-icon-dark.png',
    size: 1024,
    body: orb(...SPLASH, { night: true }) + moon(...SPLASH, BOOST),
    opaque: true,
    bg: NIGHT_BG,
  },
  // iOS 18 dark icon: the orb on a transparent ground — iOS lays its own dark backdrop under
  // it (Apple HIG, App icons). The night halo, because white light on that backdrop is a disc.
  {
    name: 'icon-dark.png',
    size: 1024,
    body: orb(...ICON, { night: true }) + moon(...ICON, BOOST),
  },
  // iOS 18 tinted icon: a grayscale picture on black; iOS colours it by brightness. Opaque
  // black, as Apple's template is, so no stray alpha decides the tint.
  {
    name: 'icon-tinted.png',
    size: 1024,
    body: `<g style="filter: grayscale(1)">${orb(...ICON, { night: true }) + moon(...ICON, BOOST)}</g>`,
    opaque: true,
    bg: '#000000',
  },
  // Web: no halo, no glow (they would blur at 48 px); the moon a little larger to read.
  {
    name: 'favicon.png',
    size: 48,
    body:
      orb(...FAVICON, { halo: false, shadow: false }) +
      moon(...FAVICON, BOOST * 1.25, { glow: false, reflection: false }),
  },
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
  if (ONLY && !ONLY.has(f.name)) continue;
  await page.setViewportSize({ width: f.size, height: f.size });
  await page.setContent(
    `<html><body style="margin:0;background:${f.opaque ? (f.bg ?? BG) : 'transparent'}">${svg(
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
