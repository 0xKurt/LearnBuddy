// The palette this device wears (issue #29), as a settings group. The choice itself lives
// in components/lb/LookChoice.tsx — the onboarding asks the same question (issue #136),
// and one question deserves one component.

import { useTranslation } from 'react-i18next';

import { type Family, type Mode } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Card } from '../lb/Card.js';
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
      <Card padding={20}>
        {/* Two axes since #140: the colour, and whether it is light or dark. Each swatch
            previews the family in the mode that is showing, so the choice is honest — a
            green card while the app is dark shows the DARK green. */}
        <Row question={t('look.question')} current={familyLabel(family)} hint={t('look.hint')}>
          <FamilyChoice />
        </Row>
        <Row
          question={t('look.mode_question')}
          current={modeLabel(mode)}
          hint={t('look.mode_hint')}
        >
          <ModeChoice />
        </Row>
      </Card>
    </Group>
  );
}
