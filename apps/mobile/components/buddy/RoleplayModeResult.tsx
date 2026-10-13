// How a roleplay or a rehearsal went, as the design's ONE card (components/practice/Modes.jsx:
// 52–66 `ModeResult`, ui_kits/app/Extra.jsx:199): what it was, a title, what went well with a
// tick each, and one lavender box for what to try next time. No score, no count of points, no
// level (CLAUDE.md rule 6, HANDOFF §4): every line is a fact the server checked or measured.
//
// The design's "Fertig" and "Nochmal" are not here: in the thread the card is simply read past,
// and a second round is asked of Buddy like the first — a button would need a way to start one
// that the app does not have (rule 12: no button without a handler).

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RADIUS } from '../../lib/theme/radius.js';
import { ROLEPLAY } from '../../lib/theme/roleplay.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';

export type ModeRow = {
  key: string;
  /** It went well: a tick. Otherwise it stands in the box for next time. */
  right: boolean;
  /** What the line is about ("Tempo", "Noch nicht dabei"); null where the tick says it all. */
  label: string | null;
  text: string;
  /** Under it, quieter: her own words, a better line, the verdict on the length. */
  detail: string | null;
  /** What a screen reader hears where the tick alone carries the meaning. */
  spoken?: string;
};

function Lines({ row }: { row: ModeRow }) {
  const { palette } = useTheme();
  return (
    <View
      accessible={row.spoken !== undefined}
      accessibilityRole={row.spoken !== undefined ? 'text' : undefined}
      accessibilityLabel={row.spoken}
    >
      {row.label ? <Text style={TYPE.label}>{row.label}</Text> : null}
      <Text style={[TYPE.reviewDetail, { color: palette.ink }]}>{row.text}</Text>
      {row.detail ? <Text style={TYPE.reviewDetail}>{row.detail}</Text> : null}
    </View>
  );
}

export function ModeResult({
  label,
  title,
  rows,
}: {
  label: string;
  title: string;
  rows: readonly ModeRow[];
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const good = rows.filter((r) => r.right);
  const next = rows.filter((r) => !r.right);
  return (
    <Card padding={CARD_PAD.thread}>
      <View>
        <Text style={TYPE.label}>{label}</Text>
        <Text accessibilityRole="header" style={TYPE.title}>
          {title}
        </Text>
      </View>
      {good.length > 0 ? (
        <View testID="mode-result-good" style={{ gap: ROLEPLAY.result.rows }}>
          {good.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', gap: SPACE.sm }}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ marginTop: ROLEPLAY.result.tickTop }}
              >
                <Icon name="check" size={ROLEPLAY.result.tick} color={palette.successText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Lines row={row} />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {next.length > 0 ? (
        <View
          testID="mode-result-next"
          style={{
            backgroundColor: palette.primaryLt,
            borderRadius: RADIUS.md,
            paddingVertical: ROLEPLAY.result.boxPadV,
            paddingHorizontal: ROLEPLAY.result.boxPadH,
            gap: ROLEPLAY.result.rows,
          }}
        >
          <Text style={[TYPE.label, { color: palette.primaryDk }]}>{t('mode_result.next')}</Text>
          {next.map((row) => (
            <Lines key={row.key} row={row} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
