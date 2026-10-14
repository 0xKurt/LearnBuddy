// A few ways forward in a sheet (#599; design components/practice/Modes.jsx `ChoiceList`,
// ui_kits/app/Extra.jsx `StartSheet`): "Was willst du üben?" with the ways to start, and the
// short either/or before homework or vocabulary (photograph it or type it). Each way is a paper
// row of its own — a tone tile with its sign, the words, a chevron — never a grid of tiles and
// never a second primary. The sheet closes with its own button as always (CLAUDE.md rule 14).

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { UI } from '../../lib/theme/components.js';
import { HOME } from '../../lib/theme/home.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Icon, type IconName } from '../lb/Icon.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';

type Choice = { label: string; icon: IconName; onPress: () => void };

/** The tiles' tones, in the design's order (Modes.jsx:74–78). */
const TONES: readonly SubjectTone[] = ['sky', 'lavender', 'peach', 'mint', 'butter'];

type Props = {
  visible: boolean;
  title: string;
  /** One quiet line under the title, where the choice needs a word. */
  body?: string;
  choices: readonly Choice[];
  onClose: () => void;
};

export function ChoiceSheet({ visible, title, body, choices, onClose }: Props) {
  useTheme();
  const { t } = useTranslation('common');
  return (
    <Sheet visible={visible} title={title} closeLabel={t('actions.close')} onClose={onClose}>
      {body ? <Text style={[TYPE.small, SHEET_TEXT]}>{body}</Text> : null}
      <View style={{ gap: SPACE.sm }}>
        {choices.map((choice, i) => (
          <ChoiceRow key={choice.label} choice={choice} tone={TONES[i % TONES.length]!} />
        ))}
      </View>
    </Sheet>
  );
}

function ChoiceRow({ choice, tone }: { choice: Choice; tone: SubjectTone }) {
  const { palette, tones } = useTheme();
  return (
    <Card
      onPress={choice.onPress}
      accessibilityLabel={choice.label}
      padding={0}
      radius={RADIUS.md}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: HOME.choice.row,
        paddingHorizontal: HOME.choice.padX,
        paddingVertical: HOME.choice.padY,
      }}
    >
      <View
        style={{
          width: HOME.choice.tile,
          height: HOME.choice.tile,
          borderRadius: RADIUS.sm,
          backgroundColor: tones.bg[tone],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={choice.icon} size={HOME.choice.glyph} color={tones.deep[tone]} />
      </View>
      <Text style={[TYPE.option, { flex: 1, minWidth: 0 }]}>{choice.label}</Text>
      <Icon name="chevron" size={UI.list.chevron} color={palette.ink3} />
    </Card>
  );
}
