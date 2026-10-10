// The learning domain gives the core everything it adds from one place (lib/learning/register.tsx,
// issue #107). A place it forgets would quietly leave the app without a card, a way to start or
// its math — the core works without them, so nothing else would turn red. A place filled twice
// is a wiring fault: a second card for the same tool, or the registration run twice.

import { describe, expect, it } from 'vitest';

import { homeFollowers } from '../../../lib/api/queries.js';
import { notation } from '../../../lib/buddy/notation.js';
import { pageHandler } from '../../../lib/capture/pages.js';
import { registerLearning } from '../../../lib/learning/register.js';
import { sayNotation } from '../../../lib/speech/say.js';
import {
  addActionCard,
  cardTools,
  messageCards,
  readAlong,
  readingSteps,
  resultNotice,
  startMenu,
  workingOn,
} from '../../buddy/extensions.js';
import { inlineNotation } from '../../lb/InlineText.js';

registerLearning();

describe('the learning domain fills every place of the core (issue #107)', () => {
  it('brings a card for each of its tools into the chat', () => {
    expect(cardTools()).toEqual([
      'offer_learning',
      'offer_drill',
      'start_roleplay',
      'offer_rehearsal',
    ]);
  });

  it('draws the roleplay feedback and the rehearsal in place of their bubbles', () => {
    expect(messageCards.keys()).toEqual(['roleplay_feedback', 'rehearsal']);
  });

  it('keeps the library list in step with the home', () => {
    expect(homeFollowers.keys()).toEqual(['library']);
  });

  it.each([
    readAlong,
    workingOn,
    resultNotice,
    readingSteps,
    startMenu,
    notation,
    inlineNotation,
    sayNotation,
    pageHandler,
  ])('fills $name', (place) => {
    expect(place.get(), place.name).not.toBeNull();
  });
});

describe('nothing is given twice', () => {
  it('refuses the registration a second time', () => {
    expect(() => registerLearning()).toThrow(/schon belegt/);
  });

  it('refuses a second card for a tool that has one', () => {
    expect(() => addActionCard('offer_drill', () => null)).toThrow(/offer_drill schon belegt/);
  });
});
