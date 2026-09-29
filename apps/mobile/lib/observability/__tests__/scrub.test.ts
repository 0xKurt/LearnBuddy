import type { Event } from '@sentry/react-native';
import { describe, expect, it } from 'vitest';

import { assertEuIngest, isEuIngest, redact, scrubBreadcrumb, scrubEvent } from '../scrub.js';

describe('isEuIngest', () => {
  it('accepts the EU ingest host', () => {
    expect(isEuIngest('https://abcdef1234@o123456.ingest.de.sentry.io/4507')).toBe(true);
  });

  it('refuses the US host, the bare domain and a lookalike', () => {
    expect(isEuIngest('https://abcdef@o123456.ingest.sentry.io/4507')).toBe(false);
    expect(isEuIngest('https://abcdef@o123456.ingest.us.sentry.io/4507')).toBe(false);
    // The suffix is matched with its dot, so nobody can register the host as a prefix.
    expect(isEuIngest('https://abcdef@ingest.de.sentry.io.example.com/4507')).toBe(false);
    expect(isEuIngest('https://abcdef@notingest.de.sentry.io.evil/4507')).toBe(false);
  });

  it('refuses plain http and anything unparsable', () => {
    expect(isEuIngest('http://abcdef@o1.ingest.de.sentry.io/4507')).toBe(false);
    expect(isEuIngest('')).toBe(false);
    expect(isEuIngest('o1.ingest.de.sentry.io')).toBe(false);
  });

  it('throws without echoing the DSN', () => {
    const dsn = 'https://secretkey@o1.ingest.us.sentry.io/4507';
    expect(() => assertEuIngest(dsn)).toThrow(/EU DSN/);
    try {
      assertEuIngest(dsn);
    } catch (error) {
      expect((error as Error).message).not.toContain('secretkey');
    }
    expect(() => assertEuIngest('https://k@o1.ingest.de.sentry.io/4507')).not.toThrow();
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console and network crumbs whole', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'Buddy: Super gemacht, Lena!' })).toBe(
      null,
    );
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: 'https://api/x?token=abc' } })).toBe(
      null,
    );
    expect(scrubBreadcrumb({ category: 'fetch' })).toBe(null);
    expect(scrubBreadcrumb({ message: 'no category' })).toBe(null);
  });

  it('keeps a navigation crumb down to where and when', () => {
    const kept = scrubBreadcrumb({
      category: 'navigation',
      level: 'info',
      timestamp: 12,
      message: 'went somewhere',
      data: { from: '/buddy', to: '/practice/abc', payload: 'Ich habe eine 3 geschrieben' },
    });
    expect(kept).toEqual({
      category: 'navigation',
      level: 'info',
      timestamp: 12,
      data: { from: '/buddy', to: '/practice/abc' },
    });
    expect(kept?.message).toBeUndefined();
  });

  it('keeps a crumb without data free of an empty data object', () => {
    expect(scrubBreadcrumb({ category: 'app.lifecycle', type: 'navigation' })).toEqual({
      category: 'app.lifecycle',
      type: 'navigation',
    });
  });
});

describe('scrubEvent', () => {
  function fullEvent(): Event {
    return {
      message: 'failed for lena@example.com',
      logentry: { message: 'hi lena@example.com', params: ['Ich habe Angst vor der Arbeit'] },
      user: { id: 'u1', email: 'lena@example.com', ip_address: '1.2.3.4' },
      request: { url: 'https://api/v1/buddy', headers: { authorization: 'Bearer x' } },
      extra: { lastMessage: 'Ich habe eine 3 geschrieben' },
      server_name: 'lenas-iphone',
      contexts: {
        device: { model: 'iPhone14,5' },
        response: { body_size: 2 },
        state: { state: { type: 'zustand', value: { thread: 'alles was sie schrieb' } } },
      },
      exception: { values: [{ type: 'ApiError', value: 'no user lena@example.com' }] },
      breadcrumbs: [
        { category: 'console', message: 'Buddy sagt: Super!' },
        { category: 'navigation', data: { from: '/buddy', to: '/talk' } },
      ],
    };
  }

  it('removes every field that can carry her words or her address', () => {
    const event = scrubEvent(fullEvent());
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.contexts?.['response']).toBeUndefined();
    expect(event.contexts?.['state']).toBeUndefined();
    expect(event.logentry).toEqual({ message: 'hi [email]' });
  });

  it('keeps what a developer needs: the device and the stack', () => {
    const event = scrubEvent(fullEvent());
    expect(event.contexts?.['device']).toEqual({ model: 'iPhone14,5' });
    expect(event.exception?.values?.[0]?.type).toBe('ApiError');
  });

  it('redacts addresses in the message and in the exception value', () => {
    const event = scrubEvent(fullEvent());
    expect(event.message).toBe('failed for [email]');
    expect(event.exception?.values?.[0]?.value).toBe('no user [email]');
  });

  it('keeps only the breadcrumbs that survive scrubbing', () => {
    const event = scrubEvent(fullEvent());
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/buddy', to: '/talk' } },
    ]);
  });

  it('handles an event that carries almost nothing', () => {
    expect(scrubEvent({})).toEqual({ breadcrumbs: [] });
  });
});

describe('redact', () => {
  it('leaves ordinary text alone', () => {
    expect(redact('Fast richtig — fehlt nur noch das Komma')).toBe(
      'Fast richtig — fehlt nur noch das Komma',
    );
  });

  it('finds an address in the middle of a sentence', () => {
    expect(redact('mail an a.b+c@sub.example.co.uk ging nicht')).toBe('mail an [email] ging nicht');
  });
});
