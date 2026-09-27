import { PUSH_CATEGORY } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import de from '../../locales/de/common.json';
import { ACTION_ID, categorySpecs, practiceRoute, pressOf } from '../pushActions.js';

const title = (key: string) => {
  const [group, name] = key.split('.') as [string, string];
  return (de as unknown as Record<string, Record<string, string>>)[group]![name]!;
};

describe('notification buttons (gaps #16)', () => {
  it('offers "Jetzt üben" only on practice that is ready; every message can be quietened', () => {
    const specs = categorySpecs(title);
    const byId = Object.fromEntries(specs.map((c) => [c.id, c.actions]));
    expect(byId[PUSH_CATEGORY.practice]!.map((a) => a.buttonTitle)).toEqual([
      'Jetzt üben',
      'Heute nicht',
      'Seltener schreiben',
    ]);
    expect(byId[PUSH_CATEGORY.message]!.map((a) => a.buttonTitle)).toEqual([
      'Heute nicht',
      'Seltener schreiben',
    ]);
  });

  it('only "Jetzt üben" opens the app; the others are answered from the lock screen', () => {
    const opens = Object.fromEntries(
      categorySpecs(title)[0]!.actions.map((a) => [a.identifier, a.options.opensAppToForeground]),
    );
    expect(opens).toEqual({
      [ACTION_ID.practice_now]: true,
      [ACTION_ID.not_today]: false,
      [ACTION_ID.less_often]: false,
    });
  });

  it('maps a press to what the API is asked; a plain tap or anything unknown just opens', () => {
    expect(pressOf(ACTION_ID.practice_now)).toEqual({
      kind: 'action',
      action: 'practice_now',
      opens: true,
    });
    expect(pressOf(ACTION_ID.not_today)).toEqual({
      kind: 'action',
      action: 'not_today',
      opens: false,
    });
    expect(pressOf(ACTION_ID.less_often)).toEqual({
      kind: 'action',
      action: 'less_often',
      opens: false,
    });
    expect(pressOf('expo.modules.notifications.actions.DEFAULT')).toEqual({ kind: 'open' });
    expect(pressOf('lb.something_newer')).toEqual({ kind: 'open' });
  });

  it('"Jetzt üben" leads to the practice the server started, or to Buddy when none is open', () => {
    expect(practiceRoute('5b0c7f7e-8a5c-4f7e-9d7e-3c1f2a1b0c9d')).toBe(
      '/practice/5b0c7f7e-8a5c-4f7e-9d7e-3c1f2a1b0c9d',
    );
    expect(practiceRoute(null)).toBe('/buddy');
  });
});
