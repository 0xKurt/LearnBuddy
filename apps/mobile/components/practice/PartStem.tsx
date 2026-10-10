// The situation of a task in parts (issue #297): the same material above each of its parts,
// because b) and c) are computed from its numbers as much as a) is.
//
// It never folds away like a drawing does while she types (#379): she types FROM its numbers. With
// the keyboard up it keeps two lines and scrolls in itself instead — the one part of the card that
// may, like a reading text ("nur ein Text scrollt", rule 16; `scroll-text` in tests/web/fit.ts) —
// so the field, its keys and "Prüfen" stay whole above the keyboard (#419, `cutControls`). A long
// material (a source, a text to analyse, Schnitt 4) is held to the share a reading text has
// (`maxHeight`) the same way, so the question under it always stands. The fade at its bottom says
// there is more; the same edge every scrolling text has (`EdgeFade`).

import type { TaskPartView } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { bottomEdgeMask } from '../lb/EdgeFade.js';
import { MathText } from '../math/MathText.js';

/** Lines of the situation that stay while she types: what a sentence with its numbers needs. */
const TYPING_LINES = 2;

export function PartStem({
  stem,
  typing,
  maxHeight,
}: {
  stem: string;
  typing: boolean;
  /** Its height while she reads: the share of the screen a reading text has. */
  maxHeight: number;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const bound = typing ? TYPING_LINES * TYPE.body.lineHeight : maxHeight;
  const [more, setMore] = useState(false);
  const [scrolls, setScrolls] = useState(false);
  const measure = (offset: number, box: number, content: number) =>
    setMore(content - (offset + box) > SPACE.xs);
  return (
    <ScrollView
      testID="scroll-text"
      nestedScrollEnabled
      // Reachable by keyboard when it scrolls (axe `scrollable-region-focusable`).
      focusable={scrolls}
      accessibilityLabel={t('parts.stem')}
      scrollEnabled={scrolls}
      style={[
        { flexGrow: 0, marginBottom: SPACE.sm, maxHeight: bound },
        more ? bottomEdgeMask() : null,
      ]}
      scrollEventThrottle={64}
      onScroll={(e) => {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        measure(contentOffset.y, layoutMeasurement.height, contentSize.height);
      }}
      onContentSizeChange={(_, h) => {
        setScrolls(h > bound + SPACE.xs);
        measure(0, Math.min(bound, h), h);
      }}
    >
      <MathText text={stem} inlineFractions style={[TYPE.body, { color: palette.ink }]} />
    </ScrollView>
  );
}

/** A part's question as the sheet prints it: its letter before it („b) …"), else as it is. */
export function lettered(prompt: string, part: Pick<TaskPartView, 'part'> | null): string {
  return part ? `${part.part}) ${prompt}` : prompt;
}
