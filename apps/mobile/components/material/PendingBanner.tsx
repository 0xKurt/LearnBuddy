// Small banner shown at the top of the material list while at least one
// material is being extracted in the background. Reassures the user
// that work IS happening, so they can navigate away without anxiety.

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';

export function PendingBanner({ count }: { count: number }) {
  const { t } = useTranslation('home');
  if (count <= 0) return null;
  return (
    <View style={styles.banner}>
      <ActivityIndicator size="small" color={LB.primary} />
      <Text style={styles.text}>{t('material.pending_banner', { count })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(177,73,60,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(177,73,60,0.15)',
    marginBottom: 12,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: LB.ink2,
    fontWeight: '500',
  },
});
