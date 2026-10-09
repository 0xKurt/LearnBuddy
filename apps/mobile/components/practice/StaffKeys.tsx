// Die Tasten unter der Notenzeile, auf die sie schreibt (issues #226, #275), als zwei Reihen der
// einen Tastenreihe (`KeyRow`, issue #310 Schritt 4) — dieselben Tasten wie die Mathe-Zeichen
// unter einem Feld, an derselben Stelle der Antworthülle (`keys`):
//
//   · oben, was die gesetzte Note bewegt: höher und tiefer; dann was eine Note verändert oder
//     ersetzt (Kreuz, Pause), dann Hören und Zurück;
//   · unten der Wert, mit dem die nächste Note geschrieben wird (eine Wahl aus fünf), und der
//     Punkt (ein Schalter) — nah am Daumen. Die Tasten zeigen das Zeichen, das sie setzen; der
//     Name steht im Label.
//
// Beide Reihen spannen die ganze Breite (`fill`): sie stehen unter einer Zeile derselben Breite,
// und sechs gleich breite Tasten sind auf jedem Handy ≥ 44 pt (lib/keyRow.ts).

import {
  dottedRestOk,
  NOTE_VALUES,
  pitchAtStep,
  STAFF_STEP_MAX,
  staffStep,
  type StaffElement,
  type StaffWriteSurface,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { playPitch } from '../../lib/music/play.js';
import { elementWord, stepWord, valueWord } from '../../lib/music/words.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from '../lb/Icon.js';
import { KeyRow, type Key } from '../lb/KeyRow.js';
import { ValueGlyph } from '../math/StaffLine.js';
import { activeBar, clampStep, lastNote, usePut, type StaffAnswerState } from './StaffAnswer.js';
import { useListen } from './useListen.js';

type Props = {
  surface: StaffWriteSurface;
  answer: StaffAnswerState;
  disabled: boolean;
  onChange: (next: StaffAnswerState) => void;
};

/** A drawn sign is this tall on a key: the note values read at a glance (issue #275). */
const GLYPH = 32;

export function StaffKeys({ surface, answer, disabled, onChange }: Props) {
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  const written = answer.bars.filter((bar) => bar.length > 0);
  const empty = written.length === 0;
  // The same hearing as every "Anhören" (`useListen`); here it is a key of the row it belongs to,
  // the same size as its neighbours — not a pill among keys.
  const listen = useListen({ tones: { bars: written, tempo: surface.tempo } });
  const playing = listen.state('normal') === 'playing';
  const put = usePut(surface, answer, onChange);

  const moving = lastNote(answer);
  const movingEl = moving === null ? null : answer.bars[moving.bar]?.[moving.index];
  const movingStep = movingEl?.el === 'note' ? staffStep(movingEl.pitch, surface.clef) : null;

  function nudge(by: 1 | -1): void {
    if (moving === null || movingStep === null || movingEl?.el !== 'note') return;
    const step = clampStep(movingStep + by);
    if (step === movingStep) return;
    const pitch = pitchAtStep(step, surface.clef, answer.sharp);
    playPitch(pitch);
    const moved: StaffElement = { ...movingEl, pitch };
    onChange({
      ...answer,
      bars: answer.bars.map((b, i) =>
        i === moving.bar ? b.map((x, k) => (k === moving.index ? moved : x)) : b,
      ),
    });
    announce(t('staff.moved', { what: elementWord(tm, moved), where: stepWord(tm, step) }));
  }

  function addRest(): void {
    // Eine punktierte ganze oder halbe Pause gibt es nicht (`dottedRestOk`): der Punkt fällt weg,
    // und der Screenreader sagt, was wirklich gesetzt wurde.
    put(activeBar(answer, surface), {
      el: 'rest',
      value: answer.value,
      dotted: answer.dotted && dottedRestOk(answer.value),
    });
  }

  function undo(): void {
    for (let i = answer.bars.length - 1; i >= 0; i--) {
      if ((answer.bars[i] as StaffElement[]).length === 0) continue;
      onChange({ ...answer, bars: answer.bars.map((b, k) => (k === i ? b.slice(0, -1) : b)) });
      return;
    }
  }

  /** A switch: lit while it is on, and its name says so — colour is never the only signal. */
  const toggle = (label: string, on: boolean) => (on ? t('staff.toggle_on', { label }) : label);
  const icon = (name: 'up' | 'down' | 'undo' | 'speak' | 'stop') => (color: string) => (
    <Icon name={name} size={24} color={color} />
  );

  const tools: Key[] = [
    {
      id: 'higher',
      face: icon('up'),
      label: t('staff.higher'),
      disabled: movingStep === null || movingStep >= STAFF_STEP_MAX,
      onPress: () => nudge(1),
    },
    {
      id: 'lower',
      face: icon('down'),
      label: t('staff.lower'),
      disabled: movingStep === null || movingStep <= -STAFF_STEP_MAX,
      onPress: () => nudge(-1),
    },
    {
      id: 'sharp',
      face: (color) => <Text style={[TYPE.prompt, { color, fontWeight: '700' }]}>♯</Text>,
      label: toggle(t('staff.sharp'), answer.sharp),
      on: answer.sharp,
      onPress: () => onChange({ ...answer, sharp: !answer.sharp }),
    },
    {
      id: 'rest',
      face: (color) => <ValueGlyph value={answer.value} rest size={GLYPH} color={color} />,
      label: t('staff.rest_of', { value: valueWord(tm, answer.value, false, true) }),
      onPress: addRest,
    },
    {
      id: 'play',
      face: icon(playing ? 'stop' : 'speak'),
      // What it says is its state too: never the colour alone.
      label: playing ? t('listen.stop') : t('listen.play'),
      ...(playing ? {} : { hint: t('listen.hint_tones') }),
      disabled: empty,
      onPress: () => listen.play('normal'),
    },
    {
      id: 'undo',
      face: icon('undo'),
      label: t('staff.undo'),
      quiet: true,
      disabled: empty,
      onPress: undo,
    },
  ];

  const values: Key[] = [
    ...NOTE_VALUES.map(
      (value): Key => ({
        id: value,
        face: (color) => <ValueGlyph value={value} size={GLYPH} color={color} />,
        label: valueWord(tm, value, false, false),
        selected: value === answer.value,
        onPress: () => onChange({ ...answer, value }),
      }),
    ),
    {
      // Der Punkt ist ein SCHALTER, keine Wahl aus mehreren: sein Zustand steht im Namen und
      // nicht in `selected` (das machte aus ihm ein einzelnes Radio).
      id: 'dot',
      face: (color) => (
        <View
          style={{
            width: SPACE.sm,
            height: SPACE.sm,
            borderRadius: SPACE.xs,
            backgroundColor: color,
          }}
        />
      ),
      label: toggle(t('staff.dot'), answer.dotted),
      on: answer.dotted,
      onPress: () => onChange({ ...answer, dotted: !answer.dotted }),
    },
  ];

  return (
    <View style={{ gap: SPACE.sm }}>
      <KeyRow keys={tools} label={t('staff.keys_label')} fill disabled={disabled} />
      <KeyRow
        keys={values}
        label={t('staff.values_label')}
        role="radiogroup"
        fill
        disabled={disabled}
      />
    </View>
  );
}
