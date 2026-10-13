// The sheet pinned under the head of its own page (ui_kits/app/Extra.jsx:113–116): one small
// paper page per photographed page, and beside them the way into practising it. The pages are a
// sign, not her photos — the app keeps no picture of a page to show (MaterialView has none).
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { MATERIAL_DETAIL } from '../../lib/theme/materialDetail.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

const PAGES = MATERIAL_DETAIL.pages;

export function SheetPages({ count, children }: { count: number; children?: ReactNode }) {
  const { palette } = useTheme();
  const shown = Math.min(count, PAGES.most);
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: SPACE.sm,
        marginTop: PAGES.top,
        marginHorizontal: PAGES.side,
        minHeight: PAGES.height,
      }}
    >
      {/* How many pages there are is said in words in the head. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: SPACE.sm }}
      >
        {Array.from({ length: shown }, (_, page) => (
          <View
            key={page}
            style={{
              width: PAGES.width,
              height: PAGES.height,
              borderRadius: PAGES.radius,
              backgroundColor: palette.paper,
              padding: SPACE.sm,
              gap: SPACE.xs,
              ...SHADOW.soft,
            }}
          >
            {PAGES.lines.map((width, line) => (
              <View
                key={line}
                style={{
                  width,
                  height: PAGES.line,
                  borderRadius: PAGES.lineRadius,
                  backgroundColor: palette.hairline,
                }}
              />
            ))}
          </View>
        ))}
      </View>
      {/* At the row's end, level with the pages' middle (a button keeps to the start of its box). */}
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <View style={{ justifyContent: 'center' }}>{children}</View>
      </View>
    </View>
  );
}
