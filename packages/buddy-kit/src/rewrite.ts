// The new app's own identity, written into the files that carry the source's (issue #107 §2).
// Each rewrite reads what the source has (source.ts) and replaces it — nothing here names
// LearnBuddy's projects, so a changed Expo project or API host of the source needs no edit
// here; what a rewrite misses, `findForeign` reports and create-buddy fails on.

import { type BuddyConfig, KitError } from './config.js';
import { isObject, type Json, type JsonObject, withBuddyIgnored, withHealthUrl } from './local.js';
import { BUILD_FLAGS, type SourceIdentity } from './source.js';

type Rewrite = (text: string, config: BuddyConfig, source: SourceIdentity) => string;

const json = (value: JsonObject) => `${JSON.stringify(value, null, 2)}\n`;

function pascal(id: string): string {
  return id
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Permission texts the stores show: the source's speak of its domain ("Arbeitsblätter
 * fotografieren"); a new app asks in its own name. German or English, by default language.
 */
function permissionTexts(config: BuddyConfig): Record<string, string> {
  const n = config.identity.name;
  const de = config.content.defaultLocale === 'de';
  const camera = de ? `Damit du ${n} ein Foto zeigen kannst.` : `So you can show ${n} a photo.`;
  const photos = de
    ? `Damit du ${n} Fotos aus deiner Mediathek zeigen kannst.`
    : `So you can show ${n} photos from your library.`;
  const microphone = de
    ? `Damit du mit ${n} sprechen kannst, statt zu tippen.`
    : `So you can talk to ${n} instead of typing.`;
  return {
    NSCameraUsageDescription: camera,
    cameraPermission: camera,
    NSPhotoLibraryUsageDescription: photos,
    photosPermission: photos,
    NSMicrophoneUsageDescription: microphone,
    microphonePermission: microphone,
  };
}

/** apps/mobile/app.json with the new identity and none of the source's project links. */
const appJson: Rewrite = (text, config, source) => {
  const root = JSON.parse(text) as JsonObject;
  const expo = root.expo;
  if (!isObject(expo)) throw new KitError('apps/mobile/app.json has no "expo" object');
  const { id, name, bundleId, scheme } = config.identity;
  expo.name = name;
  expo.slug = id;
  expo.scheme = scheme;
  // Owner, update URL and EAS project belong to the source's Expo account; `provision`
  // writes the new ones once the project exists (pnpm provision --set expoProjectId=…).
  delete expo.owner;
  delete expo.updates;
  if (isObject(expo.extra)) {
    delete expo.extra.eas;
    if (Object.keys(expo.extra).length === 0) delete expo.extra;
  }
  if (isObject(expo.ios)) expo.ios.bundleIdentifier = bundleId;
  if (isObject(expo.android)) {
    expo.android.package = bundleId;
    // google-services.json is the source's Firebase app and is not copied.
    delete expo.android.googleServicesFile;
  }
  const texts = permissionTexts(config);
  // Share extension names ("LearnBuddy Share", "LearnBuddyShare") and permission texts.
  const rename = (v: Json, key?: string): Json => {
    if (typeof v === 'string') {
      if (key !== undefined && key in texts) return texts[key]!;
      if (v === source.name) return name;
      if (v === `${source.name} Share`) return `${name} Share`;
      if (v === `${source.name}Share`) return `${pascal(id)}Share`;
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => rename(x));
    if (isObject(v))
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x, k)]));
    return v;
  };
  if (Array.isArray(expo.plugins)) expo.plugins = expo.plugins.map((p) => rename(p));
  if (isObject(expo.ios) && isObject(expo.ios.infoPlist))
    expo.ios.infoPlist = rename(expo.ios.infoPlist) as JsonObject;
  return json(root);
};

/** apps/mobile/app.config.ts: the dev variant's name (its id follows the bundle id). */
const appConfig: Rewrite = (text, config, source) =>
  text.replaceAll(`'${source.name} Dev'`, `'${config.identity.name.replaceAll("'", "\\'")} Dev'`);

/**
 * apps/mobile/eas.json without the source's API and Supabase addresses and legal URLs: a build
 * of the new app must never reach the source's backend. A build flag (an internal preview may
 * start without legal URLs) stays. `provision` fills the addresses from the new projects.
 */
const easJson: Rewrite = (text) => {
  const root = JSON.parse(text) as JsonObject;
  const build = root.build;
  if (isObject(build)) {
    for (const profile of Object.values(build)) {
      if (!isObject(profile) || !isObject(profile.env)) continue;
      for (const key of Object.keys(profile.env)) {
        if (key.startsWith('EXPO_PUBLIC_') && !BUILD_FLAGS.has(key)) delete profile.env[key];
      }
    }
  }
  return json(root);
};

/** The scripts that only make new apps; a new app does not make further apps from itself. */
const KIT_ONLY_SCRIPTS = ['create-buddy'];

/** The root package.json: the app's own name, without the generator. */
const packageJson: Rewrite = (text, config) => {
  const root = JSON.parse(text) as JsonObject;
  root.name = config.identity.id;
  root.description = `${config.identity.name} — a Buddy app. See docs/.`;
  if (isObject(root.scripts)) for (const s of KIT_ONLY_SCRIPTS) delete root.scripts[s];
  return json(root);
};

/** infra/supabase/config.toml: the local Docker stack (its volumes) is named per app. */
const supabaseToml: Rewrite = (text, config) =>
  text.replace(/^project_id\s*=\s*"[^"]*"/m, `project_id = "${config.identity.id}"`);

/** Files rewritten as a whole. */
export const REWRITES: Record<string, Rewrite> = {
  'apps/mobile/app.json': appJson,
  'apps/mobile/app.config.ts': appConfig,
  'apps/mobile/eas.json': easJson,
  'package.json': packageJson,
  'infra/supabase/config.toml': supabaseToml,
  // The probe watches the source's production API until `provision` knows this app's.
  '.github/workflows/health.yml': (text) => withHealthUrl(text, ''),
  '.gitignore': (text) => withBuddyIgnored(text),
};

/**
 * In every copied text file: the source's bundle id (Maestro flows, the store link, the share
 * extension's app group) and, in the files that act, its repository become the new app's.
 */
export function rewriteEverywhere(
  text: string,
  file: string,
  config: BuddyConfig,
  source: SourceIdentity,
): string {
  let out = text.replaceAll(source.bundleId, config.identity.bundleId);
  const repo = source.foreign.find((f) => f.text === source.repoSlug);
  if (repo?.match && (!repo.only || repo.only.test(file))) {
    const target = config.identity.repo ?? `<github-owner>/${config.identity.id}`;
    out = out.replace(new RegExp(repo.match.source, 'g'), target);
  }
  return out;
}
