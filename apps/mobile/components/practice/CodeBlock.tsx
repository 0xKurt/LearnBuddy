// A program as the question shows it (Informatik, issue #262, `CodeFigure`): monospace, its
// indentation kept, and — where the lines are asked about — their numbers in a quiet column of
// their own. A line wider than the phone scrolls sideways inside the block only; the page never
// does (rule 16). The block is text, not a drawing: a screen reader hears it line by line with
// the line numbers, the way a teacher reads a program out.
//
// The server writes the lines exactly as they run (`apps/api/src/modules/practice/code.ts`); this
// file only sets them.

import type { CodeFigure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { describeFigure } from '../math/describeFigure.js';

/**
 * Spaces as they were typed: a browser collapses a run of ordinary spaces, and a program's
 * indentation IS its meaning (`print` under `for` or beside it are two programs).
 */
export function keepSpaces(text: string): string {
  return text.replace(/ /g, ' ');
}

type Props = {
  figure: CodeFigure;
  /** The tallest the block may stand; a longer program scrolls inside it. */
  maxHeight?: number;
};

export function CodeBlock({ figure, maxHeight }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('math');
  // The program in words, line by line, as every figure says itself (`describeFigure`).
  const label = describeFigure(figure, t, null);
  return (
    <View
      testID="code-block"
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        backgroundColor: palette.canvas,
        borderRadius: RADIUS.frame,
        maxHeight,
        overflow: 'hidden',
      }}
    >
      <ScrollView bounces={false} contentContainerStyle={{ padding: SPACE.md }}>
        <View style={{ flexDirection: 'row', gap: SPACE.md }}>
          {figure.numbered ? (
            <View>
              {figure.lines.map((_, i) => (
                <Text key={i} style={[TYPE.code, { color: palette.ink3, textAlign: 'right' }]}>
                  {i + 1}
                </Text>
              ))}
            </View>
          ) : null}
          <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator>
            <View>
              {figure.lines.map((line, i) => (
                <Text key={i} style={TYPE.code}>
                  {keepSpaces(line) || ' '}
                </Text>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
