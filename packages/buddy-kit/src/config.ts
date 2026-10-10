// buddy.config.json — what makes a new Buddy app this app and no other (issue #107 §2).
//
// Four parts, as the issue lays them out: identity (names and ids), policy (audience and the
// regions, which are not a choice: EU only), content (languages) and wiring (capabilities).
// A fifth, `legal`, is what `provision --env production` refuses to go without (§4).
//
// Validated with zod at every read, so a hand-edited file that asks for a US region or a
// malformed bundle id stops the script instead of reaching a console.

import { z } from 'zod';

/** The app languages this codebase has every key for (apps/mobile/lib/i18n parity test). */
export const KIT_LOCALES = ['de', 'en', 'fr', 'es', 'it'] as const;

/** Optional capabilities. Each brings native modules, permissions and possibly a processor. */
export const CAPABILITIES = ['voice', 'camera', 'share', 'push', 'crash-reports'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Same rule as apps/api/src/config.ts (EuLocation): "eu" or a europe-* region, nothing else. */
const EuVertexLocation = z
  .string()
  .regex(/^(eu|europe-[a-z]+[0-9]+)$/, 'only the EU: "eu" or a europe-* region');

export const BuddyConfig = z
  .object({
    identity: z.object({
      /** Lower-case id: repository, Expo slug, Vercel and Supabase project names. */
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,30}$/, 'lower case letters, digits and "-", 2–31 characters'),
      /** Shown on the home screen and in the store. */
      name: z.string().trim().min(1).max(30),
      /** iOS bundle id and Android package, e.g. "com.example.fitbuddy". */
      bundleId: z
        .string()
        .regex(
          /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/,
          'reverse domain, at least three lower-case parts: com.example.fitbuddy',
        ),
      /** Deep-link scheme, e.g. "fitbuddy" (Supabase redirect `<scheme>://**`). */
      scheme: z.string().regex(/^[a-z][a-z0-9+.-]{1,30}$/, 'lower case, starts with a letter'),
      /**
       * The app's own GitHub repository ("owner/name"): CLAUDE.md files issues there. Unset, the
       * copy names a placeholder — never the repository it was made from.
       */
      repo: z
        .string()
        .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, 'owner/name')
        .optional(),
    }),
    policy: z.object({
      /** minors-with-guardian keeps the adult PIN and the parents' consent; adults-only does not. */
      audience: z.enum(['adults-only', 'minors-with-guardian']),
      /** Not a choice: the kit provisions in Frankfurt only (issue #107 §3). */
      supabaseRegion: z.literal('eu-central-1'),
      vercelRegion: z.literal('fra1'),
      vertexLocation: EuVertexLocation,
    }),
    content: z
      .object({
        locales: z.array(z.enum(KIT_LOCALES)).min(1),
        defaultLocale: z.enum(KIT_LOCALES),
      })
      .refine((c) => c.locales.includes(c.defaultLocale), {
        message: 'defaultLocale must be one of locales',
        path: ['defaultLocale'],
      })
      .refine((c) => new Set(c.locales).size === c.locales.length, {
        message: 'locales must not repeat',
        path: ['locales'],
      }),
    wiring: z.object({
      capabilities: z
        .array(z.enum(CAPABILITIES))
        .refine((c) => new Set(c).size === c.length, 'capabilities must not repeat'),
    }),
    legal: z
      .object({
        /** The controller under the GDPR (issue #107: Zero X Ventures for new Buddys). */
        controller: z.string().trim().min(1).optional(),
        controllerAddress: z.string().trim().min(1).optional(),
        privacyUrl: z.string().url().startsWith('https://').optional(),
        imprintUrl: z.string().url().startsWith('https://').optional(),
        supportEmail: z.string().email().optional(),
      })
      .default({}),
  })
  .strict();
export type BuddyConfig = z.infer<typeof BuddyConfig>;

/** What `provision --env production` needs before it does anything (issue #107 §4). */
export function missingForProduction(config: BuddyConfig): string[] {
  const legal = config.legal;
  const missing: string[] = [];
  if (!legal.controller) missing.push('legal.controller');
  if (!legal.controllerAddress) missing.push('legal.controllerAddress');
  if (!legal.privacyUrl) missing.push('legal.privacyUrl');
  if (!legal.imprintUrl) missing.push('legal.imprintUrl');
  if (!legal.supportEmail) missing.push('legal.supportEmail');
  return missing;
}

/** Parses a config, with every problem in one message ("identity.bundleId: …"). */
export function parseConfig(raw: unknown): BuddyConfig {
  const parsed = BuddyConfig.safeParse(raw);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new KitError(`buddy.config.json is not valid:\n  ${lines.join('\n  ')}`);
}

/** An error the CLI prints as it is, without a stack. */
export class KitError extends Error {
  override name = 'KitError';
}
