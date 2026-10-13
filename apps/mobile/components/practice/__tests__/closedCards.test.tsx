// What stands under a closed question (#599): the solution, "Selbst gelöst!" and the words of the
// Hörtext read as text — only their titles are strong, as before the redesign — and the help
// chips stand 8 apart (design components/core/Chip.jsx `ChipRow`) without their 44 pt targets
// overlapping where the row wraps.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UI } from '../../../lib/theme/components.js';
import { TOUCH } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { HeardTextCard } from '../HeardTextCard.js';
import { HelpChips } from '../HelpChips.js';
import { SelfSolvedCard, SolutionCard } from '../SolutionCard.js';

const weight = (text: string): string => screen.getByText(text).style.fontWeight;

describe('the cards under a closed question', () => {
  it('SolutionCard: the title is strong, the calm line under the solution is plain', () => {
    renderInApp(<SolutionCard answer="42" numeric />);
    expect(weight('Lösung')).toBe('600');
    expect(weight('Schau sie dir in Ruhe an.')).toBe('400');
  });

  it('SelfSolvedCard: the line under its title is plain', () => {
    renderInApp(<SelfSolvedCard />);
    expect(weight('Das hast du allein herausgefunden.')).toBe('400');
  });

  it('HeardTextCard: the title is strong, the text reads as text', () => {
    renderInApp(<HeardTextCard text="Le chat dort sur le canapé." />);
    expect(weight('Das war der Hörtext')).toBe('600');
    expect(weight('Le chat dort sur le canapé.')).toBe('400');
  });
});

describe('the help chips', () => {
  it('stand 8 apart, and two rows keep their touch targets clear of each other', () => {
    renderInApp(<HelpChips onHint={() => undefined} onReveal={() => undefined} />);
    const row = styleOf(screen.getByTestId('help-chips'));
    expect(row.columnGap).toBe('8px');
    // A chip is 34 high in a 44 pt target: a row's step must be at least the target's height.
    expect(UI.chip.height + parseFloat(row.rowGap)).toBeGreaterThanOrEqual(TOUCH);
  });
});
