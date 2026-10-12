// Original App.jsx destination menu; actual question actions are a separate contextual group.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { UI } from '../../lib/theme/components.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Sheet } from '../lb/Sheet.js';
export type MenuPath =
  | '/capture'
  | '/library'
  | '/memory'
  | '/history'
  | '/settings'
  | '/settings/profile';
const DESTINATIONS = [
  ['capture', 'camera', '/capture'],
  ['library', 'file', '/library'],
  ['memory', 'sparkle', '/memory'],
  ['history', 'undo', '/history'],
  ['settings', 'pencil', '/settings'],
  ['profile', 'sparkle', '/settings/profile'],
] as const;
export function MenuSheet({
  visible,
  onGo,
  onClose,
  onClosed,
  contextual,
}: {
  visible: boolean;
  onGo: (path: MenuPath) => void;
  onClose: () => void;
  onClosed: () => void;
  contextual?: ReactNode;
}) {
  const { t } = useTranslation(['buddy', 'common']);
  return (
    <Sheet
      visible={visible}
      title={t('buddy:menu.title')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
      onClosed={onClosed}
      scrollTestID="scroll-list"
    >
      <ListGroup>
        {DESTINATIONS.map(([key, icon, path]) => (
          <Row
            key={key}
            title={t(`buddy:menu.${key}`)}
            icon={icon}
            iconTone="accent"
            iconSize={UI.iconButton.glyph}
            onPress={() => onGo(path)}
          />
        ))}
      </ListGroup>
      {contextual}
    </Sheet>
  );
}
