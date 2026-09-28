// The palette this device wears (issue #29). Curated choices, no colour picker: the app
// must stay calm and friendly whatever she takes (docs/DESIGN-BRIEF.md). Every palette
// holds the same contrast pairs (lib/theme/__tests__/contrast.test.ts).

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { THEME_NAMES, type ThemeName } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Card } from '../lb/Card.js';
import { Btn } from '../lb/Btn.js';
import { Group } from './Group.js';
import { Row } from './Row.js';

export function LookSection() {
  const { t } = useTranslation('settings');
  const { name, choose } = useTheme();
  const label = (n: ThemeName) => t(`look.name.${n}`);
  return (
    <Group title={t('look.title')} fold="look" summary={label(name)}>
      <Card padding={20}>
        <Row question={t('look.question')} current={label(name)} hint={t('look.hint')}>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {THEME_NAMES.map((n) => (
              <Btn
                key={n}
                full
                pill
                size="sm"
                variant={n === name ? 'primary' : 'outline'}
                selected={n === name}
                onPress={() => choose(n)}
              >
                {label(n)}
              </Btn>
            ))}
          </View>
        </Row>
      </Card>
    </Group>
  );
}
