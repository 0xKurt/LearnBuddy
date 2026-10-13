// The head of every screen (design components/buddy/Header.jsx; owner rule 1, #599): Buddy's orb,
// the title on one line, then the two controls every head carries — the Vorlesen switch and ⋯.
// Presentation only: where a button leads and what the orb shows is its caller's (`Screen`, the
// chat's `Header`), which is why ⋯ has no default here — a head cannot be drawn without saying
// what its menu opens (CLAUDE.md rule 12).
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { HEADER, headerIsBrand, headerOrbSlot } from '../../lib/theme/header.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { BuddyOrb, type MoonState } from './BuddyOrb.js';
import { IconBtn } from './IconBtn.js';
import { Progress } from './Progress.js';
import { ReadAloudSwitch } from './ReadAloudSwitch.js';

/**
 * Between the subtitle and its tail ("Frage 1 von 3 · noch 10 Min."): written here, once. The tail
 * is a text of its own on one line (`nowrap`), and a browser drops an ordinary space a line starts
 * with — it stood "Frage 1 von 3· noch 10 Min." —, so the first one is a no-break space.
 */
const SUBTITLE_JOIN = '\u00A0· ';

export type BuddyHeaderProps = {
  title: string;
  subtitle?: string;
  /**
   * What closes the subtitle and must stay whole: the time left in a test with time (design
   * ui_kits/app/Tasks.jsx:185, `white-space: nowrap`). The subtitle before it may end in "…";
   * this part never shrinks. `label`: its full words for a screen reader ("Noch 10 Minuten").
   */
  subtitleTail?: { text: string; label: string };
  /** What is happening on the screen, as the orb's pose (lib/buddy/headState.ts). */
  state?: MoonState;
  leading?: {
    icon: 'back' | 'close';
    label?: string;
    hint?: string;
    disabled?: boolean;
    onPress: () => void;
  };
  /**
   * What ⋯ opens — or, as `own`, the ⋯ a screen still draws itself with its own sheet (a practice
   * question's "Frage passt nicht"). `null` only where a menu would mislead (the parents' PIN
   * pad). Both exceptions are counted in lib/__tests__/headerShell.test.ts.
   */
  menu: { onPress: () => void } | { own: ReactNode } | null;
  footer?: ReactNode;
  progress?: { total: number; current: number; part?: number; label: string };
  /**
   * A head that still brings its own right end INSTEAD of the switch and ⋯: the card pass, until
   * the practice area moves it onto `leading` (#599). No new caller.
   */
  trailing?: ReactNode;
  testID?: string;
};

export function BuddyHeader({
  title,
  subtitle,
  subtitleTail,
  state = 'idle',
  leading,
  menu,
  footer,
  progress,
  trailing,
  testID,
}: BuddyHeaderProps) {
  const brand = headerIsBrand({ subtitle, leading });
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
          <IconBtn
            tone="plain"
            icon={leading.icon}
            onPress={leading.onPress}
            accessibilityLabel={leading.label}
            accessibilityHint={leading.hint}
            disabled={leading.disabled}
          />
        ) : null}
        <View
          // The pose the head shows, where the walkthrough can read it (tests/web/header.spec.ts).
          testID={`header-orb-${state}`}
          style={{
            width: headerOrbSlot(brand),
            height: size,
            marginLeft: leading ? HEADER.orbOffset.leading : HEADER.orbOffset.bare,
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[TYPE.headerMeta, { flexShrink: 1, minWidth: 0 }]}
              >
                {subtitle}
              </Text>
              {subtitleTail ? (
                <Text
                  testID="header-subtitle-tail"
                  accessibilityLabel={subtitleTail.label}
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[TYPE.headerMeta, { flexShrink: 0 }]}
                >
                  {`${SUBTITLE_JOIN}${subtitleTail.text}`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {trailing ?? (
          <>
            <ReadAloudSwitch />
            {menu === null ? null : 'own' in menu ? (
              menu.own
            ) : (
              <IconBtn tone="plain" icon="more" onPress={menu.onPress} />
            )}
          </>
        )}
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
