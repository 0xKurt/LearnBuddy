// The learning domain gives the core everything it adds from one place (lib/learning/register.tsx,
// issue #107). A place it forgets would quietly leave the app without a card, a way to start or
// its math — the core works without them, so nothing else would turn red. A place filled twice
// is a wiring fault: a second card for the same tool, or the registration run twice.

import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { homeFollowers } from '../../../lib/api/queries.js';
import { homeTop } from '../../../lib/homeLayout.js';
import { notation } from '../../../lib/buddy/notation.js';
import { pageHandler } from '../../../lib/capture/pages.js';
import { registerLearning } from '../../../lib/learning/register.js';
import { sayNotation } from '../../../lib/speech/say.js';
import {
  addActionCard,
  cardTools,
  messageCards,
  messageExtras,
  readAlong,
  homeScope,
  profileSubjects,
  receipts,
  startMenu,
  workingOn,
} from '../../buddy/extensions.js';
import { homeNoticeSlot } from '../../buddy/HomeNotices.js';
import { homeBar } from '../../buddy/HomeTop.js';
import { InlineText, inlineNotation } from '../../lb/InlineText.js';
import { TYPE } from '../../../lib/theme/type.js';
import { renderInApp } from '../../../testing/render.js';
import { MathText } from '../../math/MathText.js';

registerLearning();

describe('the learning domain fills every place of the core (issue #107)', () => {
  it('brings a card for each of its tools into the chat', () => {
    expect(cardTools()).toEqual([
      'offer_learning',
      'show_ready',
      'offer_drill',
      'start_roleplay',
      'offer_rehearsal',
    ]);
  });

  it('words a receipt line for what Buddy did with her practice, her sheets and her talks', () => {
    expect(receipts.keys()).toEqual([
      'prepare_practice',
      'request_material',
      'show_ready',
      'delete_material',
      'plan_talk',
      'rename_material',
      'delete_item',
    ]);
  });

  it('draws the roleplay feedback, the rehearsal and her sent sheet in place of their bubbles', () => {
    expect(messageCards.keys()).toEqual(['roleplay_feedback', 'rehearsal', 'sheet']);
  });

  it('hangs the start a background message announces under it (issue #632)', () => {
    expect(messageExtras.keys()).toEqual(['announces']);
  });

  it('keeps the library list in step with the home', () => {
    expect(homeFollowers.keys()).toEqual(['library']);
  });

  it.each([
    readAlong,
    profileSubjects,
    workingOn,
    homeTop,
    homeNoticeSlot,
    homeBar,
    homeScope,
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

describe('a run of model text is running text (#642)', () => {
  it('sets its fractions in the line, as the question sets them (#288)', () => {
    // Stacked at the full step a ¼ in Buddy's reply stood two lines tall and pulled its line apart
    // from the ones around it; it is drawn exactly as the question's sentence draws it.
    const text = 'Dann hast du $\\frac{1}{4}$ der Pizza.';
    const drawn = (node: ReactNode) => {
      const view = renderInApp(<>{node}</>);
      const html = view.container.innerHTML;
      view.unmount();
      return html;
    };
    expect(drawn(<InlineText text={text} style={TYPE.body} />)).toBe(
      drawn(<MathText text={text} style={TYPE.body} inlineFractions />),
    );
  });
});
