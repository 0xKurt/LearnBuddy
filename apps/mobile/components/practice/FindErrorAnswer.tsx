// Fehlerdetektiv (issue #260): ein vorgerechneter Weg, Zeile unter Zeile, wie im Heft. Genau eine
// Zeile folgt nicht aus der davor. Sie tippt sie an — und die Zeile selbst wird zum Feld, mit
// ihrem Text darin: verbessert wird an Ort und Stelle, nur das Falsche wird geändert. Ein Tipp auf
// eine andere Zeile wählt die; das × in der gewählten nimmt die Wahl zurück (rückgängig statt
// bestätigen, docs/UX-PRINCIPLES.md). „Prüfen" schickt Zeile und Verbesserung als `parts`; welche
// Zeile falsch ist und ob die Verbesserung folgt, entscheidet der Server mit Code
// (apps/api/src/modules/practice/findError.ts) — nie ein Modell.
//
// Die erste Zeile ist die Aufgabe, nicht ein Schritt: sie steht da, ist aber nicht antippbar. In
// einer Termkette steht vor jeder weiteren Zeile ein „=", in einer eigenen schmalen Spalte, damit
// die Terme untereinander stehen.
//
// Keine Mathe-Tasten: eine verbesserte Zeile braucht Ziffern, einen Buchstaben und + − = ( ), und
// die hat jede Tastatur („*" und „:" liest der Server als Mal und Geteilt). Die Tastenreihe kostete
// auf 360×740 genau die Zeile, die Buddys Antwort braucht (Walkthrough, #260).
//
// Mehr gibt es nicht: eine Zeile Anleitung, bis sie eine Zeile gewählt hat, die Zeilen, „Prüfen"
// (Minimalismus, Owner 02.10.). Farbe ist nie das einzige Signal: die gewählte Zeile ist ein Feld
// mit Rand und × und heißt für den Screenreader „Zeile 4 richtig".

import {
  FIND_ERROR_FIX_MAX,
  type FindErrorTaskView,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { BottomBar } from './BottomBar.js';
import { PartsArea } from './PartsArea.js';

/** What she has chosen and written: the tapped line and her correction of it. */
export type LinePick = { line: string | null; fix: string };

/**
 * Her choice as kept in the draft, with anything that is not a step of this task — or not
 * the shape at all — left out. The first line is the task, never a choice.
 */
export function pickFrom(kept: string, view: Pick<FindErrorTaskView, 'lines'>): LinePick {
  try {
    const parsed: unknown = JSON.parse(kept || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { line: null, fix: '' };
    }
    const { line, fix } = parsed as { line?: unknown; fix?: unknown };
    const steps = view.lines.slice(1).map((l) => l.id);
    const ok = typeof line === 'string' && steps.includes(line);
    return {
      line: ok ? line : null,
      fix: ok && typeof fix === 'string' ? fix.slice(0, FIND_ERROR_FIX_MAX) : '',
    };
  } catch {
    return { line: null, fix: '' };
  }
}

/**
 * One tap on a step: the chosen line again lets it go; another line is chosen, and its
 * text is put in the field to be corrected (as on paper: change only what is wrong).
 */
export function tapLine(
  view: Pick<FindErrorTaskView, 'lines'>,
  now: LinePick,
  id: string,
): LinePick {
  if (now.line === id) return { line: null, fix: '' };
  const text = view.lines.find((l) => l.id === id)?.text ?? '';
  return { line: id, fix: text };
}

/** The line text as it stands on the screen, without the "=" column. */
const LINE_SIZE = 19;
/** The "=" in front of a term line: a narrow column of its own, so the terms line up. */
const EQ_COL = 22;

type Props = {
  view: FindErrorTaskView;
  /** Where her choice is kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": a line chosen and corrected; `shown` is her answer in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function FindErrorAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const pick = pickFrom(kept, view);
  const input = useRef<TextInput | null>(null);
  const terms = view.chain === 'term';
  const chosenAt = view.lines.findIndex((l) => l.id === pick.line);
  const complete = pick.line !== null && pick.fix.trim() !== '';

  const save = (next: LinePick) => keep(JSON.stringify(next));
  const submit = () => {
    if (disabled || !complete || pick.line === null) return;
    const fix = pick.fix.trim();
    onSubmit(
      { type: 'find_error', line: pick.line, fix },
      t('find_error.shown', { n: chosenAt + 1, line: terms ? `= ${fix}` : fix }),
    );
  };

  const lineText = (text: string, color: string) => (
    <Text
      style={{
        flexShrink: 1,
        color,
        fontSize: LINE_SIZE,
        lineHeight: 26,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      }}
    >
      {text}
    </Text>
  );
  /** "1", "2" … in front of a line, and the "=" of a term chain after it. */
  const lead = (n: number, color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text
        style={[TYPE.label, { width: SPACE.xl, color: palette.ink2, textAlign: 'left' }]}
        accessible={false}
      >
        {n}
      </Text>
      {terms ? (
        <Text
          accessible={false}
          style={{ width: EQ_COL, color, fontSize: LINE_SIZE, lineHeight: 26, fontWeight: '600' }}
        >
          {n > 1 ? '=' : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <PartsArea>
        <View style={{ gap: SPACE.xs }}>
          {pick.line === null ? (
            <Text style={[TYPE.small, { color: palette.ink2, marginBottom: SPACE.xs }]}>
              {t('find_error.how')}
            </Text>
          ) : null}
          {view.lines.map((line, i) => {
            const n = i + 1;
            const shown = terms && i > 0 ? `= ${line.text}` : line.text;
            const spoken = speakMathText(shown, words);
            if (i === 0) {
              // The task itself: read, never tapped.
              return (
                <View
                  key={line.id}
                  accessible
                  accessibilityLabel={t('find_error.task_line', { text: spoken })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: TOUCH,
                    paddingHorizontal: SPACE.md,
                  }}
                >
                  {lead(n, palette.ink)}
                  {lineText(line.text, palette.ink)}
                </View>
              );
            }
            const chosen = pick.line === line.id;
            if (chosen) {
              // The chosen line IS the field: corrected in place, as on paper, with its own
              // text in it to change. One row, not a second one under it — on 360×740 that row
              // and Buddy's reply did not fit together (walkthrough, #260).
              return (
                <View
                  key={line.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: TOUCH,
                    paddingLeft: SPACE.md,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: palette.primary,
                    backgroundColor: palette.primaryLt,
                  }}
                >
                  {lead(n, palette.primaryDk)}
                  <TextInput
                    ref={input}
                    value={pick.fix}
                    editable={!disabled}
                    onChangeText={(typed) =>
                      save({ ...pick, fix: typed.slice(0, FIND_ERROR_FIX_MAX) })
                    }
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={submit}
                    accessibilityLabel={t('find_error.fix_label', { n })}
                    accessibilityHint={t('find_error.fix_hint')}
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="none"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                    maxLength={FIND_ERROR_FIX_MAX}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: TOUCH - 4,
                      paddingHorizontal: SPACE.sm,
                      marginVertical: SPACE.xs / 2,
                      borderRadius: 8,
                      backgroundColor: palette.paper,
                      color: palette.ink,
                      fontSize: LINE_SIZE,
                      fontWeight: '600',
                      outlineWidth: 0,
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('find_error.let_go', { n })}
                    disabled={disabled}
                    onPress={() => save(tapLine(view, pick, line.id))}
                    style={{
                      width: TOUCH,
                      height: TOUCH,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="close" size={18} color={palette.primaryDk} />
                  </Pressable>
                </View>
              );
            }
            return (
              <Pressable
                key={line.id}
                accessibilityRole="button"
                accessibilityLabel={t('find_error.line', { n, text: spoken })}
                accessibilityHint={t('find_error.hint_open')}
                disabled={disabled}
                onPress={() => save(tapLine(view, pick, line.id))}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      minHeight: TOUCH,
                      paddingHorizontal: SPACE.md,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: palette.hairline,
                      backgroundColor: pressed ? palette.lavender : palette.paper,
                    }}
                  >
                    {lead(n, palette.ink)}
                    <View style={{ flex: 1, flexDirection: 'row' }}>
                      {lineText(line.text, palette.ink)}
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </PartsArea>
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || !complete}
          onPress={submit}
          accessibilityHint={complete ? undefined : t('find_error.check_waits')}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}
