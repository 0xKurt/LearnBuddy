// The palette this device wears (issue #29), as a settings group. The choice itself lives
// in components/lb/LookChoice.tsx — the onboarding asks the same question (issue #136),
// and one question deserves one component.

import { useTranslation } from 'react-i18next';

import { type Family } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ListGroup } from '../lb/ListGroup.js';
import { View } from 'react-native';
import { CARD_PAD } from '../../lib/theme/space.js';
import { FamilyChoice, ModeChoice } from '../lb/LookChoice.js';
import { Row } from './Row.js';

export function LookSection() {
  const { t } = useTranslation('settings');
  const { family } = useTheme();
  const familyLabel = (f: Family) => t(`look.family.${f}`);

  return (
    <ListGroup label={t('look.title')}>
      {/* The two rows need air between them: the colour labels and the next question
          collided on the phone (owner 01.10.). */}
      <View style={{ padding: CARD_PAD.base }}>
        {/* Two axes since #140: the colour, and whether it is light or dark. The dot IS
            the preview — drawn from that family's own palette in the mode that is showing
            — and picking one applies it at once, which shows more than any mock sentence
            could (#172). */}
        <Row question={t('look.question')} current={familyLabel(family)} hint={t('look.hint')}>
          <FamilyChoice />
        </Row>
      </View>
      <View style={{ padding: CARD_PAD.base }}>
        <ModeChoice />
      </View>
    </ListGroup>
  );
}
