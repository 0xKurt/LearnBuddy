import { describe, expect, it } from 'vitest';

import { keys } from '../../api/keys.js';
import { learnerLocaleOf } from '../follow.js';

describe('the language follows the profile', () => {
  it('takes the learner locale from GET /me, whatever screen loaded it', () => {
    expect(learnerLocaleOf(keys.me, { account: null, learner: { locale: 'fr' } })).toBe('fr');
  });

  it('ignores /me without a profile and every other query', () => {
    expect(learnerLocaleOf(keys.me, { account: null, learner: null })).toBeNull();
    expect(learnerLocaleOf(keys.home, { learner: { locale: 'fr' } })).toBeNull();
    expect(learnerLocaleOf(keys.material('x'), undefined)).toBeNull();
  });
});
