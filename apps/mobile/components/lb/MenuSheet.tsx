// What hides behind the ⋯ in the head: ONE list of places (#599; design
// ui_kits/app/App.jsx:125–134 — a sheet "Mehr" with one `ListGroup`, six rows, each with its sign
// and a chevron). The same six on every screen; a screen may put what only it can do before them
// (the chat: the way into "Was willst du üben?", a sheet: renaming it).
//
// The four ways to start that stood here as a grid of tiles (issues #174–#180) are in the start
// sheet now, where the design has them (ui_kits/app/Extra.jsx `StartSheet`, components/practice/
// Modes.jsx `ChoiceList`); this menu only leads there.

import { useTranslation } from 'react-i18next';

import type { IconName } from './Icon.js';
import { ListGroup, Row } from './ListGroup.js';
import { Sheet } from './Sheet.js';

/** Something a screen offers: in the ⋯ menu a row, in the start sheet a way to start. */
export type StartItem = { key: string; label: string; icon: IconName; onPress: () => void };

/**
 * What a screen puts before the places: a row like theirs with a short label. It does something
 * here, so it ends in no chevron — unless it `leads` on to a list of its own (the chat's ways to
 * start). `accessibilityLabel` is the whole sentence where the short label needs its object
 * ("„Brüche“ umbenennen").
 */
export type MenuAction = StartItem & { accessibilityLabel?: string; leads?: boolean };

/** Where a row leads. `capture` is no screen: the chat's bar takes the photo (owner 12.10.). */
export type Place = 'capture' | 'library' | 'memory' | 'history' | 'settings' | 'profile';

/**
 * App.jsx:127–132, in its order, with its signs — except "Profil": the prototype gives it the
 * memory row's sparkle, so two rows looked alike (#642); it wears the set's own person sign.
 */
const PLACES: ReadonlyArray<{ place: Place; icon: IconName; label: string }> = [
  { place: 'capture', icon: 'camera', label: 'buddy:area.capture' },
  { place: 'library', icon: 'file', label: 'buddy:menu.library' },
  { place: 'memory', icon: 'sparkle', label: 'buddy:menu.memory' },
  { place: 'history', icon: 'undo', label: 'buddy:menu.history' },
  { place: 'settings', icon: 'pencil', label: 'buddy:menu.settings' },
  { place: 'profile', icon: 'profile', label: 'settings:profile.page_title' },
];

type Props = {
  visible: boolean;
  /** What this screen puts before the places. */
  actions: readonly MenuAction[];
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
            accessibilityLabel={action.accessibilityLabel}
            chevron={action.leads === true}
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
