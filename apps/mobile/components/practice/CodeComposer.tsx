// Das Feld, in das sie Code oder eine Ausgabe schreibt (issue #262, `CodeTypeSurface`).
//
// Dieselbe schwebende weiße Fläche wie das gewöhnliche Antwortfeld (`AnswerComposer`), nur mit
// fester Zeichenbreite und ohne alles, was eine Tastatur „hilfreich" verändert: keine
// Autokorrektur, keine automatische Großschreibung, keine Rechtschreibprüfung — aus `print`
// würde sonst `Print`, und das wäre ein Fehler, den sie nicht gemacht hat.
//
// Für ein Programm kommen zwei Tipphilfen dazu (`lib/practice/codeEntry.ts`): eine neue Zeile
// übernimmt die Einrückung, und „Einrücken" setzt vier Leerzeichen. „Prüfen" steht unten rechts,
// wie überall, und ist erst wählbar, wenn sie über den vorgegebenen Anfang hinaus etwas
// geschrieben hat.

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import { autoIndent, indentAt, wroteSomething } from '../../lib/practice/codeEntry.js';
import { tapped } from '../../lib/perf.js';
import { growsWithText } from '../../lib/growsWithText.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { MONO } from '../../lib/theme/mono.js';
import { Btn } from '../lb/Btn.js';
import { BottomBar } from './BottomBar.js';

/** AnswerRequest.text allows at most 2000 characters. */
const MAX_LENGTH = 2000;

type Selection = { start: number; end: number };

type Props = {
  purpose: 'output' | 'program';
  /** Was im Feld schon steht, bevor sie tippt (`def name(a):` und eine Einrückung). */
  starter: string;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onCheck: (text: string) => void;
};

export function CodeComposer({ purpose, starter, value, disabled, onChange, onCheck }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const program = purpose === 'program';
  const input = useRef<TextInput>(null);
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  const canCheck = !disabled && wroteSomething(value, starter);

  const place = (text: string, caret: number) => {
    if (text.length > MAX_LENGTH) return;
    onChange(text);
    selection.current = { start: caret, end: caret };
    setForced({ start: caret, end: caret });
  };

  return (
    <BottomBar>
      <View
        style={[
          {
            backgroundColor: palette.paper,
            borderRadius: 22,
            paddingTop: SPACE.sm,
            paddingBottom: SPACE.sm - 2, // optisch: der Knopf trägt unten seinen eigenen Rand
            paddingHorizontal: SPACE.sm,
            gap: SPACE.xs,
            outlineStyle: 'solid',
            outlineWidth: focused ? 4 : 0,
            outlineColor: palette.ring,
          },
          SHADOW.float,
        ]}
      >
        <TextInput
          ref={input}
          testID="code-input"
          value={value}
          onChangeText={(typed) => {
            const indented = program ? autoIndent(value, typed) : null;
            if (indented) place(indented.text, indented.caret);
            else onChange(typed);
          }}
          selection={forced}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            if (forced) setForced(undefined);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          multiline
          maxLength={MAX_LENGTH}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          // Eine neue Zeile ist hier immer eine neue Zeile — abgeschickt wird mit „Prüfen".
          submitBehavior="newline"
          placeholder={program ? undefined : t('code.output_placeholder')}
          placeholderTextColor={palette.placeholder}
          accessibilityLabel={t(program ? 'code.program_label' : 'code.output_label')}
          textAlignVertical="top"
          style={[
            {
              // Drei Zeilen für ein Programm, eine für eine Ausgabe; das Feld wächst bis sechs
              // bzw. vier Zeilen mit. Mehr nimmt es nicht: auf 360×740 müssen darüber die
              // Aufgabe und Buddys Rückmeldung zu sehen bleiben (CLAUDE.md Regel 16).
              minHeight: program ? 3 * 20 + 12 : TOUCH,
              maxHeight: program ? 6 * 20 + 12 : 4 * 20 + 12,
              paddingHorizontal: SPACE.sm,
              paddingTop: 6, // optisch: zusammen mit der Zeilenhöhe 20 eine Zeile auf 32 pt
              paddingBottom: 6,
              fontFamily: MONO,
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
              backgroundColor: 'transparent',
              outlineWidth: 0,
            },
            growsWithText,
          ]}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: program ? 'space-between' : 'flex-end',
          }}
        >
          {program ? (
            <Btn
              size="sm"
              pill
              variant="soft"
              disabled={disabled}
              accessibilityLabel={t('code.indent_label')}
              onPress={() => {
                const next = indentAt(value, selection.current);
                place(next.text, next.caret);
                input.current?.focus();
              }}
            >
              {t('code.indent')}
            </Btn>
          ) : null}
          <Btn
            size="sm"
            pill
            disabled={!canCheck}
            onPress={() => {
              tapped('check');
              onCheck(value);
            }}
          >
            {t('check')}
          </Btn>
        </View>
      </View>
    </BottomBar>
  );
}
