// The palette this device wears (issue #29), as a settings group. The choice itself lives
// in components/lb/LookChoice.tsx — the onboarding asks the same question (issue #136),
// and one question deserves one component.

import { useTranslation } from 'react-i18next';

import { type Family, type Mode } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Card } from '../lb/Card.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { FamilyChoice, ModeChoice } from '../lb/LookChoice.js';
import { Group } from './Group.js';
import { Row } from './Row.js';

export function LookSection() {
  const { t } = useTranslation('settings');
  const { family, mode } = useTheme();
  const familyLabel = (f: Family) => t(`look.family.${f}`);
  const modeLabel = (m: Mode) => t(`look.mode.${m}`);

  return (
    <Group
      title={t('look.title')}
      fold="look"
      summary={`${familyLabel(family)} · ${modeLabel(mode)}`}
    >
      {/* The two rows need air between them: the colour labels and the next question
          collided on the phone (owner 01.10.). */}
      <Card padding={CARD_PAD.roomy} style={{ gap: SPACE.lg }}>
        {/* Two axes since #140: the colour, and whether it is light or dark. The dot IS
            the preview — drawn from that family's own palette in the mode that is showing
            — and picking one applies it at once, which shows more than any mock sentence
            could (#172). */}
        <Row question={t('look.question')} current={familyLabel(family)} hint={t('look.hint')}>
          <FamilyChoice />
        </Row>
        {/* The switch is its own row: its name says what it does and its hint stands under
            it (#517), so a question above it would only say the same thing twice. */}
        <ModeChoice />
      </Card>
    </Group>
  );
}
