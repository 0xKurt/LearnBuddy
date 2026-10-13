// What hides behind the ⋯ in the head: ONE list of places (#599; design
// ui_kits/app/App.jsx:125–134 — a sheet "Mehr" with one `ListGroup`, six rows, each with its sign
// and a chevron). The same six on every screen; a screen may put what only it can do before them
// (the chat: the way into "Was willst du üben?", a sheet: renaming it).
//
// The four ways to start that stood here as a grid of tiles (issues #174–#180) are in the start
// sheet now, where the design has them (ui_kits/app/Extra.jsx `StartSheet`, components/practice/
// Modes.jsx `ChoiceList`); this menu only leads there.

import { useTranslation } from 'react-i18next';

import type { IconName } from '../lb/Icon.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { Sheet } from '../lb/Sheet.js';

/** Something a screen offers: in the ⋯ menu a row, in the start sheet a way to start. */
export type StartItem = { key: string; label: string; icon: IconName; onPress: () => void };

/** Where a row leads. `capture` is no screen: the chat's bar takes the photo (owner 12.10.). */
export type Place = 'capture' | 'library' | 'memory' | 'history' | 'settings' | 'profile';

/** App.jsx:127–132, in its order, with its signs. */
const PLACES: ReadonlyArray<{ place: Place; icon: IconName; label: string }> = [
  { place: 'capture', icon: 'camera', label: 'buddy:area.capture' },
  { place: 'library', icon: 'file', label: 'buddy:menu.library' },
  { place: 'memory', icon: 'sparkle', label: 'buddy:menu.memory' },
  { place: 'history', icon: 'undo', label: 'buddy:menu.history' },
  { place: 'settings', icon: 'pencil', label: 'buddy:menu.settings' },
  { place: 'profile', icon: 'sparkle', label: 'settings:profile.page_title' },
];

type Props = {
  visible: boolean;
  /** What this screen puts before the places. */
  actions: readonly StartItem[];
  /** False while one of them would race something in flight. */
  canAct: boolean;
  /** Opens a place; the sheet closes itself first (two modals in one frame fail on iOS). */
  onGo: (place: Place) => void;
  onClose: () => void;
};

export function MenuSheet({ visible, actions, canAct, onGo, onClose }: Props) {
  const { t } = useTranslation(['buddy', 'settings', 'common']);
  return (
    <Sheet
      visible={visible}
      title={t('buddy:menu.title')}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
    >
      <ListGroup>
        {actions.map((action) => (
          <Row
            key={action.key}
            icon={action.icon}
            title={action.label}
            disabled={!canAct}
            onPress={action.onPress}
          />
        ))}
        {/* Reading aloud is NOT here: it is the speaker in the head (issue #181). */}
        {PLACES.map(({ place, icon, label }) => (
          <Row key={place} icon={icon} title={t(label)} onPress={() => onGo(place)} />
        ))}
      </ListGroup>
    </Sheet>
  );
}
