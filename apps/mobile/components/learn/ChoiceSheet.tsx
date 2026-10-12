// A short either/or before starting (homework or vocabulary: photograph it or
// type it). Paper choices; the sheet closes with its own button as always.

import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { StartChoice } from '../lb/StartChoice.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import type { IconName } from '../lb/Icon.js';
import { Sheet } from '../lb/Sheet.js';

type Choice = { label: string; icon: IconName; tone: SubjectTone; onPress: () => void };

type Props = {
  visible: boolean;
  title: string;
  body: string;
  choices: Choice[];
  onClose: () => void;
  onClosed?: () => void;
};

export function ChoiceSheet({ visible, title, body, choices, onClose, onClosed }: Props) {
  const { t } = useTranslation('common');
  return (
    <Sheet
      visible={visible}
      title={title}
      closeLabel={t('actions.close')}
      onClose={onClose}
      onClosed={onClosed}
    >
      <Text style={TYPE.meta}>{body}</Text>
      {choices.map((c) => (
        <StartChoice
          key={c.label}
          title={c.label}
          icon={c.icon}
          tone={c.tone}
          onPress={c.onPress}
        />
      ))}
    </Sheet>
  );
}
