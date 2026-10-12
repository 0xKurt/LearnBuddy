import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { ListGroup, Row as ListRow } from '../lb/ListGroup.js';
import type { Icon } from '../lb/Icon.js';

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
    <Text accessibilityRole="header" style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
      {title}
    </Text>
  );

  return (
    <View style={{ gap: SPACE.md }}>
      {foldable ? (
        <ListGroup>
          <ListRow
            title={title}
            expanded={open}
            accessibilityLabel={title}
            sub={summary}
            icon={icon}
            onPress={() => folds.toggle(fold)}
            accessibilityHint={summary}
          />
        </ListGroup>
      ) : (
        heading
      )}
      {open ? (
        <>
          {intro ? (
            <Text style={[TYPE.body, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}>
              {intro}
            </Text>
          ) : null}
          {children}
        </>
      ) : null}
    </View>
  );
}
