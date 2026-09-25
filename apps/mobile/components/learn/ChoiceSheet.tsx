// A short either/or before starting (homework or vocabulary: photograph it or
// type it). Two big Btns; the sheet closes with its own button as always.

import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import type { IconName } from '../lb/Icon.js';
import { Sheet } from '../lb/Sheet.js';

export type Choice = { label: string; icon: IconName; onPress: () => void };

type Props = {
  visible: boolean;
  title: string;
  body: string;
  choices: Choice[];
  onClose: () => void;
};

export function ChoiceSheet({ visible, title, body, choices, onClose }: Props) {
  const { t } = useTranslation('common');
  return (
    <Sheet visible={visible} title={title} closeLabel={t('actions.close')} onClose={onClose}>
      <Text style={TYPE.small}>{body}</Text>
      {choices.map((c) => (
        <Btn key={c.label} size="lg" variant="outline" icon={c.icon} full onPress={c.onPress}>
          {c.label}
        </Btn>
      ))}
    </Sheet>
  );
}
