// "Was willst du machen?" on Buddy's home: six ways to start, always there,
// two per row. Each is a Btn with an icon; every tile of a row is equally tall.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import type { IconName } from '../lb/Icon.js';
import { Section } from '../lb/Section.js';

export type StartTile = 'photo' | 'homework' | 'explain' | 'practice' | 'vocab' | 'speak';

const TILES: ReadonlyArray<readonly [StartTile, IconName]> = [
  ['photo', 'camera'],
  ['homework', 'pencil'],
  ['explain', 'bulb'],
  ['practice', 'practice'],
  ['vocab', 'book'],
  ['speak', 'mic'],
];

export function StartRow({
  disabled = false,
  onPick,
}: {
  disabled?: boolean;
  onPick: (tile: StartTile) => void;
}) {
  const { t } = useTranslation('learn');
  const rows = [TILES.slice(0, 2), TILES.slice(2, 4), TILES.slice(4, 6)];
  return (
    <Section title={t('start.title')}>
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <View key={row[0]?.[0]} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map(([tile, icon]) => (
              <View key={tile} style={{ flex: 1, flexBasis: 0 }}>
                <Btn
                  variant="outline"
                  size="sm"
                  icon={icon}
                  full
                  wrap
                  grow
                  disabled={disabled}
                  onPress={() => onPick(tile)}
                >
                  {t(`start.${tile}`)}
                </Btn>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Section>
  );
}
