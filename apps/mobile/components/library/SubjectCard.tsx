// One subject in "Dein Material" (issue #189): its name, a glimpse of what is in it, and a
// chevron that says one tap goes in. Nothing more — this is the way in, not a report.
//
// The glimpse NAMES the newest things ("Les vacances · Passé composé · und mehr") instead of
// counting them. That is the honest answer to "wie viel ist da": she sees what she would
// find. A number next to a subject would read as a workload the moment it stood there, and a
// learner is never shown a tally of what is due or left over (CLAUDE.md rule 6).

import type { LibrarySubject } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { glimpseOf } from './subjects.js';
import { KIND_TONE, type CardTone } from './tone.js';

type Props = {
  /** A real subject, or the sheets whose subject is not known yet ("Ohne Fach"). */
  subject: LibrarySubject | null;
  /** Shown instead of the subject's name when there is none ("Ohne Fach"). */
  name: string;
  onPress: () => void;
};

export function SubjectCard({ subject, name, onPress }: Props) {
  const { palette, tones } = useTheme();
  const { t } = useTranslation('library');
  const tone: CardTone = subject ? KIND_TONE[subject.kind] : 'paper';
  const glimpse = subject
    ? glimpseOf(subject, { untitled: t('untitled'), exercise: t('subject.exercise_untitled') })
    : { names: [], more: false };
  // "und mehr" rather than how many more: the point is that there is more, not a figure.
  const line = [...glimpse.names, ...(glimpse.more ? [t('subject.more')] : [])].join(' · ');
  const said = line || t('subject.nothing_yet');
  return (
    <Card
      onPress={onPress}
      padding={SPACE.lg}
      accessibilityLabel={`${name}: ${said}`}
      accessibilityHint={t('subject.open_hint')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tone === 'paper' ? palette.canvas : tones.bg[tone],
            borderWidth: 1,
            borderColor: tone === 'paper' ? palette.hairline : tones.deep[tone],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="folder" size={20} color={palette.primaryDk} />
        </View>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={[TYPE.body, { fontWeight: '600' }]}>{name}</Text>
          <Text numberOfLines={2} style={[TYPE.small, { color: palette.ink2 }]}>
            {said}
          </Text>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="chevron" size={20} color={palette.ink3} />
        </View>
      </View>
    </Card>
  );
}
