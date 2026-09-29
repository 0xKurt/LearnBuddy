// The palette this device wears (issue #29). Curated choices, no colour picker: the app
// must stay calm and friendly whatever she takes (docs/DESIGN-BRIEF.md). Every palette
// holds the same contrast pairs (lib/theme/__tests__/contrast.test.ts).
//
// Each option shows what it would look like (issue #84, owner: "man sollte vorher schon
// sehen wie es aussehen könnte"): a small card drawn in THAT palette's own colours — read
// from PALETTES, never from the palette in use, so the previews stay true whichever theme is on.

import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { paletteOf, THEME_NAMES, type ThemeName } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { Group } from './Group.js';
import { Row } from './Row.js';

function Swatch({
  name,
  on,
  label,
  sample,
  onPress,
}: {
  name: ThemeName;
  on: boolean;
  label: string;
  sample: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const p = paletteOf(name);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, checked: on }}
      // The web needs the attribute itself (axe: aria-required-attr, issue #73).
      aria-checked={on}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: on ? 2.5 : 1,
            // The ring reads in the ACTIVE palette (it frames the control, not the preview).
            borderColor: on ? palette.primary : palette.hairline,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <View style={{ backgroundColor: p.bg, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.primary }}
              />
              <Text style={{ color: p.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>
                {label}
              </Text>
              {/* The word "checked" is announced; the check is the visible twin, in the
                  preview's own readable colour — never colour alone. */}
              {on ? <Icon name="check" size={18} color={p.primaryDk} /> : null}
            </View>
            <View style={{ backgroundColor: p.paper, borderRadius: 12, padding: 10, gap: 2 }}>
              <Text style={{ color: p.ink, fontSize: 13, lineHeight: 18 }}>{sample}</Text>
              <View
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: p.primary,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: p.paper, fontSize: 12, fontWeight: '600' }}>
                  {sample.split(' ')[0]}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function LookSection() {
  const { t } = useTranslation('settings');
  const { name, choose } = useTheme();
  const label = (n: ThemeName) => t(`look.name.${n}`);
  return (
    <Group title={t('look.title')} fold="look" summary={label(name)}>
      <Card padding={20}>
        <Row question={t('look.question')} current={label(name)} hint={t('look.hint')}>
          <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
            {THEME_NAMES.map((n) => (
              <Swatch
                key={n}
                name={n}
                on={n === name}
                label={label(n)}
                sample={t('look.sample')}
                onPress={() => choose(n)}
              />
            ))}
          </View>
        </Row>
      </Card>
    </Group>
  );
}
