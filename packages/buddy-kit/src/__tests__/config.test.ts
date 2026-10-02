import { describe, expect, it } from 'vitest';

import { KitError, missingForProduction, parseConfig } from '../config.js';
import { processorsFor } from '../processors.js';
import { config } from './helpers.js';

const base = () => JSON.parse(JSON.stringify(config())) as Record<string, Record<string, unknown>>;

describe('buddy.config.json', () => {
  it('accepts a complete config', () => {
    expect(config().identity.bundleId).toBe('com.example.fitbuddy');
  });

  it('refuses every region outside the EU, with the path in the message', () => {
    const us = base();
    us.policy!.vertexLocation = 'us-central1';
    expect(() => parseConfig(us)).toThrow(/policy\.vertexLocation: only the EU/);
    const global = base();
    global.policy!.vertexLocation = 'global';
    expect(() => parseConfig(global)).toThrow(KitError);
    const supabase = base();
    supabase.policy!.supabaseRegion = 'us-east-1';
    expect(() => parseConfig(supabase)).toThrow(/policy\.supabaseRegion/);
    const vercel = base();
    vercel.policy!.vercelRegion = 'iad1';
    expect(() => parseConfig(vercel)).toThrow(/policy\.vercelRegion/);
  });

  it('refuses malformed ids and inconsistent languages', () => {
    const bundle = base();
    bundle.identity!.bundleId = 'FitBuddy';
    expect(() => parseConfig(bundle)).toThrow(/identity\.bundleId/);
    const lang = base();
    lang.content = { locales: ['en'], defaultLocale: 'de' };
    expect(() => parseConfig(lang)).toThrow(/content\.defaultLocale/);
    const unknown = base();
    unknown.content = { locales: ['tr'], defaultLocale: 'tr' };
    expect(() => parseConfig(unknown)).toThrow(/content\.locales/);
    const extra = { ...base(), surprise: true };
    expect(() => parseConfig(extra)).toThrow(/surprise|Unrecognized/);
  });

  it('names what production still lacks', () => {
    expect(missingForProduction(config())).toEqual([
      'legal.controller',
      'legal.controllerAddress',
      'legal.privacyUrl',
      'legal.imprintUrl',
      'legal.supportEmail',
    ]);
    const done = config({
      legal: {
        controller: 'Zero X Ventures',
        controllerAddress: 'Musterstraße 1, 10115 Berlin',
        privacyUrl: 'https://example.com/privacy',
        imprintUrl: 'https://example.com/imprint',
        supportEmail: 'support@example.com',
      },
    });
    expect(missingForProduction(done)).toEqual([]);
  });

  it('derives the processors from the capabilities', () => {
    const names = (caps: string[]) =>
      processorsFor(config({ capabilities: caps })).map((p) => p.name);
    expect(names([])).not.toContain('Expo Push Service');
    expect(names(['push'])).toContain('Expo Push Service');
    expect(names(['voice'])).toContain('Google Cloud — Text-to-Speech');
    expect(names(['crash-reports'])).toContain('Sentry (Functional Software Inc.)');
  });
});
