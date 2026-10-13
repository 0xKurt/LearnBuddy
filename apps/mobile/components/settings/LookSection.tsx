// "Aussehen" (ui_kits/app/Settings.jsx:15–35): the colours this device wears (issue #29) and
// whether they are light or dark (#140), each a row with its control under the title. The
// choices themselves live in components/lb/LookChoice.tsx — the setup asks the same question
// (issue #136), and one question deserves one component. A colour tile IS the preview, and
// picking one applies it at once (#172).

import { useTranslation } from 'react-i18next';

import { ListGroup, Row } from '../lb/ListGroup.js';
import { FamilyChoice, ModeChoice } from '../lb/LookChoice.js';

export function LookSection() {
  const { t } = useTranslation('settings');
  return (
    <ListGroup label={t('look.title')}>
      <Row title={t('look.colour')}>
        <FamilyChoice />
      </Row>
      <Row title={t('look.mode_label')}>
        <ModeChoice variant="settings" />
      </Row>
    </ListGroup>
  );
}
