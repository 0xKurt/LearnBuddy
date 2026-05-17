import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from './Icon.js';

export type NavKey = 'home' | 'practice' | 'camera' | 'profile';

const ITEMS: Array<{
  key: NavKey;
  i18nKey: string;
  icon: 'home' | 'practice' | 'camera' | 'profile';
}> = [
  { key: 'home', i18nKey: 'tabs.home', icon: 'home' },
  { key: 'practice', i18nKey: 'tabs.practice', icon: 'practice' },
  { key: 'camera', i18nKey: 'tabs.camera', icon: 'camera' },
  { key: 'profile', i18nKey: 'tabs.account', icon: 'profile' },
];

export function BottomNav({
  active = 'home',
  onNavigate,
}: {
  active?: NavKey;
  onNavigate?: (key: NavKey) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');
  return (
    <View
      style={{
        backgroundColor: 'rgba(253, 252, 250, 0.96)',
        borderTopColor: LB.hairline,
        borderTopWidth: 1,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingHorizontal: 6,
        flexDirection: 'row',
      }}
    >
      {ITEMS.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            key={it.key}
            onPress={() => onNavigate?.(it.key)}
            accessibilityRole="tab"
            accessibilityLabel={t(it.i18nKey)}
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 3,
              paddingVertical: 6,
            }}
          >
            <Icon name={it.icon} size={22} color={on ? LB.primary : LB.ink3} />
            <Text
              style={{
                fontSize: 10,
                color: on ? LB.primary : LB.ink3,
                fontWeight: on ? '600' : '500',
                letterSpacing: 0.1,
              }}
            >
              {t(it.i18nKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
