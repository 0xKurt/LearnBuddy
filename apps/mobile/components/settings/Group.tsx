// A group of settings under a plain heading: a short name ("Benachrichtigungen",
// "Buddys Stimme", "Für Eltern") that fits one line — the contact group used to ask a whole
// question and broke onto three lines at 360 pt (issue #287); its answer line under the
// heading ("Ja – nie nach 20:00 Uhr.") still says what is set.
//
// On the settings screen every group is closed (CLAUDE.md rule 16: rare
// settings stay closed until opened): the heading and one line with what is
// set now; a tap opens it and closes the one that was open. So the screen
// fits without scrolling, and the details are one tap away.

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';

type Folds = { open: string | null; toggle: (key: string) => void };

/** Provided by a screen whose groups fold (settings); without it groups are always open. */
export const FoldContext = createContext<Folds | null>(null);

type Props = {
  title: string;
  intro?: string;
  icon?: ComponentProps<typeof Icon>['name'];
  /** Folds under FoldContext: the group's key there … */
  fold?: string;
  /** … and what is set now, shown while it is closed. */
  summary?: string;
  children: ReactNode;
};

export function Group({ title, intro, icon, fold, summary, children }: Props) {
  const { palette } = useTheme();
  const folds = useContext(FoldContext);
  const foldable = folds !== null && fold !== undefined;
  const open = !foldable || folds.open === fold;

  const heading = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: palette.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={19} color={palette.primaryDk} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {title}
        </Text>
        {foldable && !open && summary ? (
          <Text numberOfLines={1} style={[TYPE.small, { color: palette.ink2 }]}>
            {summary}
          </Text>
        ) : null}
      </View>
      {foldable ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}
        >
          <Icon name="chevron" size={20} color={palette.ink2} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      {foldable ? (
        <View style={{ borderRadius: 20, backgroundColor: open ? 'transparent' : palette.paper }}>
          <Btn
            variant="ghost"
            full
            wrap
            onPress={() => folds.toggle(fold)}
            // Screen readers hear whether the group is open (p2-ux-settings-fold-no-expanded-state).
            expanded={open}
            accessibilityHint={summary}
            label={heading}
          >
            {title}
          </Btn>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 4 }}>{heading}</View>
      )}
      {open ? (
        <>
          {intro ? (
            <Text style={[TYPE.body, { color: palette.ink2, paddingHorizontal: 4 }]}>{intro}</Text>
          ) : null}
          {children}
        </>
      ) : null}
    </View>
  );
}
