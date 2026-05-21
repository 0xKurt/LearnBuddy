// Bottom-sheet folder picker for moving a material within the same
// subject. Lists every folder for the subject + a "No folder"
// (subject root) option. Tap to select → calls onSelect(folderId|null).

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { LB } from '../../lib/theme/colors.js';
import type { Folder } from '@learnbuddy/shared-types';

type Props = {
  visible: boolean;
  currentFolderId: string | null;
  folders: Folder[];
  onClose: () => void;
  onSelect: (folderId: string | null) => void;
  saving?: boolean;
};

export function MaterialMoveModal({
  visible,
  currentFolderId,
  folders,
  onClose,
  onSelect,
  saving,
}: Props) {
  const { t } = useTranslation('home');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t('material.actions.move')}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <FolderRow
              label={t('subject.tab_folders')}
              icon="folder"
              muted
              selected={currentFolderId === null}
              disabled={saving}
              onPress={() => onSelect(null)}
            />
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                label={f.name}
                icon="folder"
                selected={currentFolderId === f.id}
                disabled={saving}
                onPress={() => onSelect(f.id)}
              />
            ))}
          </ScrollView>
          <View style={{ marginTop: 6 }}>
            <Btn variant="outline" full onPress={onClose} disabled={saving}>
              {t('subject.cancel')}
            </Btn>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FolderRow({
  label,
  icon,
  selected,
  disabled,
  muted,
  onPress,
}: {
  label: string;
  icon: 'folder';
  selected: boolean;
  disabled?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed]}
    >
      <Icon name={icon} size={20} color={muted ? LB.ink3 : LB.ink2} />
      <Text style={[styles.rowLabel, muted && { color: LB.ink2 }]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={18} color={LB.primary} /> : null}
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
    padding: 18,
    paddingBottom: 24,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: LB.ink,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: LB.ink,
    fontWeight: '500',
  },
});
