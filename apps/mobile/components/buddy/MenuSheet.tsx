// What hides behind the ⋯ in the head (issue #174), in two groups (issue #178).
//
// The owner, on seeing eight identical pills in a row: "man sollte trennen zwischen direkt
// wichtigen sachen und dingen die in den einstellungen gehoeren und haesslich isses auch."
// He is right, and the fault was not decoration — it was that two different kinds of thing
// looked the same, so she had to read all eight every time.
//
//  - **What she can start** leads: bordered, with its symbol, in her own words. These are
//    suggestions to tap, which is what Buddy as an interface means.
//  - **Where something lives** steps back: no border, quieter ink, below a hairline.
//    Settings last, because it is wanted least often.
//
// No tile grid and no new components (rule 16, rule 13): the difference comes out of the
// weights the design system already has.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn, MAX_FONT_SCALE } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import type { IconName } from '../lb/Icon.js';
import { Sheet } from '../lb/Sheet.js';

export type StartItem = { key: string; label: string; icon: IconName; onPress: () => void };

/**
 * How narrow a column may get before the two fall back to one under each other. The
 * longest of the four words ("Hausaufgabe") with its symbol needs about this much, and a
 * phone at 320 pt or a large system text size gets the one-column layout instead of a
 * word broken in half.
 */
const COLUMN = 136;

type Props = {
  visible: boolean;
  /** The ways to start, in her own words. */
  start: StartItem[];
  /** False while a message is in flight: starting a second thing would race it. */
  canStart: boolean;
  /** Opens a place; the sheet closes itself first (two modals in one frame fail on iOS). */
  onGo: (path: '/memory' | '/library' | '/settings') => void;
  onClose: () => void;
};

export function MenuSheet({ visible, start, canStart, onGo, onClose }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  return (
    <Sheet
      visible={visible}
      title={t('buddy:menu.title')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
    >
      {/* Two columns (issue #180): four full-width rows took half the screen and read as
          a list. Side by side they read as one thing — four suggestions of equal rank.
          Rule 16 forbids a tile grid on the home; this is a sheet she opened herself, and
          the owner asked for it. Still `<Btn>` (rule 13), still four, nothing added. */}
      {/* No ways to start without a domain that gives them (issue #107): only the places. */}
      {start.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          {start.map((item) => (
            // flexBasis as a share, not 0: with a base size of 0 every item fits on one
            // line and the row never wraps — yoga decides that before minWidth applies.
            <View key={item.key} style={{ flexBasis: '47%', flexGrow: 1, minWidth: COLUMN }}>
              <Btn
                variant="outline"
                full
                disabled={!canStart}
                onPress={item.onPress}
                // Symbol above the word, not beside it: in half a sheet's width
                // "Hausaufgabe" broke in the middle next to its icon. `children` stays the
                // name a screen reader reads; this is only what the eye gets.
                label={
                  <View
                    style={{
                      alignItems: 'center',
                      gap: 6, // token-exempt: the symbol close over its word, read as one
                      paddingVertical: SPACE.xs,
                    }}
                  >
                    <Icon name={item.icon} size={24} color={palette.primaryDk} />
                    <Text
                      numberOfLines={2}
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={[
                        TYPE.body,
                        { fontWeight: '600', color: palette.ink, textAlign: 'center' },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                }
              >
                {item.label}
              </Btn>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 0 }}>
        {start.length > 0 ? (
          <View style={{ height: 1, backgroundColor: palette.hairline, marginBottom: SPACE.xs }} />
        ) : null}
        {/* Reading aloud is NOT here: it moved back into the head as a speaker with a
            visible state (issue #181). One switch, one place. */}
        {(
          [
            ['memory', '/memory'],
            ['library', '/library'],
            ['settings', '/settings'],
          ] as const
        ).map(([key, path]) => (
          <Btn key={key} variant="ghost" full wrap onPress={() => onGo(path)}>
            {t(`buddy:menu.${key}`)}
          </Btn>
        ))}
      </View>
    </Sheet>
  );
}
