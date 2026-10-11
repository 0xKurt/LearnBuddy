// Pure presentation: navigation, sound preferences and domain state stay with its caller.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { HEADER, headerOrbSlot } from '../../lib/theme/header.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { BuddyOrb, type MoonState } from './BuddyOrb.js';
import { CircleBtn } from './CircleBtn.js';
import { Progress } from './Progress.js';

export type BuddyHeaderProps = {
  title: string;
  subtitle?: string;
  state?: MoonState;
  brand?: boolean;
  leading?: {
    icon: 'back' | 'close';
    label?: string;
    hint?: string;
    disabled?: boolean;
    onPress: () => void;
  };
  footer?: ReactNode;
  sound?: ReactNode;
  trailing?: ReactNode;
  progress?: { total: number; current: number; part?: number; label: string };
  testID?: string;
};

export function BuddyHeader({
  title,
  subtitle,
  state = 'idle',
  brand = false,
  leading,
  footer,
  sound,
  trailing,
  progress,
  testID,
}: BuddyHeaderProps) {
  const size = brand ? HEADER.orb.brand : HEADER.orb.page;
  return (
    <View
      testID={testID}
      style={{
        paddingLeft: leading ? SPACE.sm : SPACE.lg,
        paddingRight: SPACE.md,
        paddingTop: HEADER.paddingTop,
        gap: SPACE.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: brand ? HEADER.gap.brand : HEADER.gap.page,
          minHeight: HEADER.band,
        }}
      >
        {leading ? (
          <CircleBtn
            plain
            icon={leading.icon}
            onPress={leading.onPress}
            accessibilityLabel={leading.label}
            accessibilityHint={leading.hint}
            disabled={leading.disabled}
          />
        ) : null}
        <View
          style={{
            width: headerOrbSlot(brand),
            height: size,
            marginLeft: brand ? HEADER.orbOffset.brand : HEADER.orbOffset.page,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BuddyOrb size={size} state={state} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={title}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={brand ? TYPE.brand : TYPE.title}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} ellipsizeMode="tail" style={TYPE.headerMeta}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {sound}
        {trailing}
      </View>
      {footer || progress ? (
        <View testID="buddy-header-footer" style={{ paddingHorizontal: SPACE.sm }}>
          {footer}
          {progress ? (
            <Progress
              total={progress.total}
              current={progress.current}
              part={progress.part}
              accessibilityLabel={progress.label}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
