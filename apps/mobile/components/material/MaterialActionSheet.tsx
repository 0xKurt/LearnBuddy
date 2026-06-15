// Bottom-sheet shown on long-press of a material card. Exposes the
// destructive actions (rename, move, delete) that don't deserve to live
// as always-visible buttons on the card itself. Pure presentation —
// the parent owns the actual mutations.

import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '../lb/Icon.js';
import { LB } from '../../lib/theme/colors.js';

type Props = {
  visible: boolean;
  onClose: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete: () => void;
};

export function MaterialActionSheet({ visible, onClose, onRename, onMove, onDelete }: Props) {
  const { t } = useTranslation('home');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* stopPropagation: tapping the sheet itself shouldn't dismiss */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {onRename ? (
            <ActionRow
              icon="pencil"
              label={t('material.actions.rename')}
              onPress={() => {
                onClose();
                onRename();
              }}
            />
          ) : null}
          {onMove ? (
            <ActionRow
              icon="folder"
              label={t('material.actions.move')}
              onPress={() => {
                onClose();
                onMove();
              }}
            />
          ) : null}
          <ActionRow
            icon="trash"
            label={t('material.actions.delete')}
            destructive
            onPress={() => {
              onClose();
              onDelete();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: 'pencil' | 'folder' | 'trash';
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? LB.danger : LB.ink;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: LB.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
