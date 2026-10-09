// "Lizenzen" under „Über LearnBuddy“ (issue #493): the packages the app ships, each folded to one
// line (name, version, licence); a tap opens its licence text below it, one at a time. A list she
// browses on purpose, so the sheet may scroll (`scroll-list`, tests/web/fit.ts). The sheet closes
// with its own button (CLAUDE.md rule 14, Sheet.tsx).

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { lazyModule } from '../../lib/lazyModule.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { FoldLabel } from '../lb/FoldLabel.js';
import { Sheet } from '../lb/Sheet.js';
import { BoneLines, SkeletonGroup } from '../lb/Skeleton.js';

const useLicences = lazyModule(() => import('../../lib/licences.js'));

type Props = { visible: boolean; onClose: () => void };

export function LicencesSheet({ visible, onClose }: Props) {
  const { t } = useTranslation(['settings', 'common']);
  const { palette } = useTheme();
  const licences = useLicences(visible)?.LICENCES ?? null;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Sheet
      visible={visible}
      title={t('settings:about.licences')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
      scrollTestID="scroll-list"
    >
      <Text style={[TYPE.body, { color: palette.ink2 }]}>{t('settings:about.licences_intro')}</Text>
      {licences === null ? (
        <SkeletonGroup label={t('settings:about.licences_loading')}>
          <BoneLines lines={6} />
        </SkeletonGroup>
      ) : (
        <View>
          {licences.map(({ name, version, licence, text }) => {
            const id = `${name}@${version}`;
            const shown = open === id;
            const title = `${name} ${version}`;
            return (
              <View key={id}>
                <Btn
                  variant="ghost"
                  size="sm"
                  full
                  expanded={shown}
                  onPress={() => setOpen(shown ? null : id)}
                  accessibilityLabel={`${title}, ${licence}`}
                  // The licence stands where a fold names its action: what she learns by looking.
                  label={<FoldLabel icon="book" title={title} action={licence} open={shown} />}
                >
                  {title}
                </Btn>
                {shown ? (
                  // Under the row's own words (the button's inset), not under the sheet's edge.
                  <Text
                    selectable
                    style={[
                      TYPE.small,
                      { color: palette.ink2, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md },
                    ]}
                  >
                    {text}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
