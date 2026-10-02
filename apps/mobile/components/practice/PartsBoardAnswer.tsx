// Das Brett: die Antworten, die aus MEHREREN TEILEN bestehen (issues #228–#230, Vertrag
// `packages/shared-types/src/contracts/parts.ts`). Eine Figur ist, was sie LIEST; eine Fläche
// ist, was sie BERÜHRT, um einen Wert zu schreiben (`FractionBarAnswer`); ein Brett ist, was
// sie ANORDNET — und seine Antwort hat so viele Teile, wie die Aufgabe Fächer hat.
//
// Vier Formen, zwei Gesten. Tippen ordnet (order, match_pairs, match_groups), Schreiben füllt
// (table_fill). Was hier wirklich wichtig ist, und warum es so und nicht einfacher ist:
//
//   · **Jedes Stück ist ein echter Knopf mit einem Namen, der seinen Zustand in WORTEN
//     sagt.** Ein `role="button"` darf kein `aria-selected`/`aria-checked` tragen — axe
//     lässt dafür den ganzen Bildschirm durchfallen, und `__tests__/FractionBarAnswer.test.tsx`
//     hält genau diesen Grund fest. „Als 3 gesetzt, nochmal tippen nimmt es zurück" ist
//     deshalb kein Komfort, sondern der einzige Weg, auf dem der Zustand ankommt.
//   · **Die Nummer, der Paar-Zähler und der Gruppenname stehen als Text auf dem Stück.**
//     Farbe ist nie das einzige Signal, und ein Marker, der immer da ist (`–` solange noch
//     nichts gesetzt ist), lässt das Stück beim Tippen nicht unter ihrem Finger breiter
//     werden.
//   · **Zurücknehmen statt bestätigen** (`docs/UX-PRINCIPLES.md`): ein zweiter Tipp nimmt
//     zurück, und die Nummern werden dabei neu durchgezählt — 1, 2, 3 ohne Loch. Es gibt
//     keinen „Löschen"-Knopf, weil es keine Frage gibt, die er stellen müsste.
//   · **Die Stücke bleiben in der Reihenfolge, die das Brett vorgibt.** Der Server mischt
//     stabil pro Frage (ein Hash der Item-Id, siehe `parts.ts`); hier wird nie nachsortiert,
//     sonst springen sie beim Neuladen unter ihrem Finger.
//
// Die Anordnung selbst ist EIN Wert: `slot → value`, genau die Form, die der Server annimmt
// (`AnswerPart`). Eine `Map`, nicht ein Objekt, weil bei `match_pairs` die EINFÜGE-Reihenfolge
// die Paar-Nummer ist: ein gelöstes Paar fällt heraus, die übrigen behalten ihre Folge und
// werden damit von selbst neu durchgezählt. Welche linke Seite offen auf ihre rechte wartet,
// ist dagegen kein Teil der Antwort, sondern ein Blick — das steht hier in lokalem State.
//
// Höhe: die Stücke sind inhaltsbreite Chips, die umbrechen. Kurze Elemente stehen damit zu
// vier in einer Zeile, lange nehmen eine ganze — das Brett schrumpft an der Stelle von selbst,
// an der es sonst über die Falte gedrückt würde (CLAUDE.md Regel 16; die Rechnung für den
// schlimmsten Fall steht in `app/practice/[id].tsx` über dem Brett-Bereich).

import {
  MAX_PART_VALUE,
  type AnswerPart,
  type BoardCell,
  type BoardPiece,
  type PartsBoard,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { cellKeys } from '../../lib/math/keys.js';
import { insertAtCursor, MathKeys, type Insertion, type Selection } from '../math/MathKeys.js';
import { useSpokenWords } from '../math/useSpokenMath.js';

// ─────────────── die Anordnung ───────────────

/**
 * Was sie angeordnet hat: Fach → Wert, genau wie `AnswerPart` es zum Server trägt.
 *
 * Die Einfüge-Reihenfolge trägt bei `match_pairs` die Paar-Nummer (siehe Kopf dieser Datei),
 * deshalb eine `Map` und kein Objekt: bei einem Objekt wäre dieselbe Zusage nur geraten.
 */
export type BoardAnswer = ReadonlyMap<string, string>;

/** Noch nichts angeordnet — ein Wert, den ein Bildschirm pro Frage halten und leeren kann. */
export const EMPTY_BOARD_ANSWER: BoardAnswer = new Map<string, string>();

const filled = (answer: BoardAnswer, slot: string): boolean =>
  (answer.get(slot) ?? '').trim() !== '';

/** `l2` vor `l10`, `p1` vor `p2`: nach Buchstabe, dann nach ZAHL — nicht als Text. */
function bySlot(a: string, b: string): number {
  if (a[0] !== b[0]) return (a[0] ?? '').localeCompare(b[0] ?? '');
  return Number(a.slice(1)) - Number(b.slice(1));
}

/**
 * Die Teile, wie der Server sie annimmt: jedes Fach einmal, kein leeres dabei, in einer
 * festen Folge (nach Fach sortiert). Die Reihenfolge ist dem Server gleich — sie steht hier,
 * damit dieselbe Anordnung immer dieselbe Anfrage ergibt.
 */
export function partsOf(answer: BoardAnswer): AnswerPart[] {
  return [...answer]
    .filter(([, value]) => value.trim() !== '')
    .map(([slot, value]) => ({ slot, value: value.trim() }))
    .sort((a, b) => bySlot(a.slot, b.slot));
}

/** Die Lücken der Tabelle in Leserichtung (Zeile für Zeile, links nach rechts). */
function gapsOf(
  board: Extract<PartsBoard, { form: 'table_fill' }>,
): Extract<BoardCell, { cell: 'gap' }>[] {
  return board.rows.flatMap((row) =>
    row.filter((cell): cell is Extract<BoardCell, { cell: 'gap' }> => cell.cell === 'gap'),
  );
}

/**
 * Die Elemente in der Folge, in der sie sie gesetzt hat (`p1`, `p2`, …).
 *
 * Gelesen über die Fach-Nummer und nicht über die Einfüge-Reihenfolge: bei `order` wird die
 * Map beim Zurücknehmen neu gebaut, und eine Folge, die vom Zufall der Einfügung abhängt,
 * wäre genau dort eine Nummer, die springt.
 */
export function orderSequence(answer: BoardAnswer): string[] {
  const out: string[] = [];
  for (let i = 1; ; i++) {
    const ref = answer.get(`p${i}`);
    if (ref === undefined || ref === '') return out;
    out.push(ref);
  }
}

/** Die Folge als Anordnung — die Nummern sind damit immer 1, 2, 3 … ohne Loch. */
function fromSequence(refs: readonly string[]): BoardAnswer {
  return new Map(refs.map((ref, i) => [`p${i + 1}`, ref]));
}

/** Ist die Anordnung vollständig? Nur dann hat „Prüfen" etwas zu prüfen. */
export function boardComplete(board: PartsBoard, answer: BoardAnswer): boolean {
  switch (board.form) {
    case 'order':
      return orderSequence(answer).length === board.elements.length;
    case 'match_pairs':
      return board.left.every((piece) => filled(answer, piece.ref));
    case 'match_groups':
      return board.elements.every((piece) => filled(answer, piece.ref));
    case 'table_fill':
      return gapsOf(board).every((gap) => filled(answer, gap.ref));
  }
}

/** Wie die Antwort zum Server reist: angeordnet wird getippt, eine Tabelle geschrieben. */
export function viaFor(board: PartsBoard): 'tapped' | 'typed' {
  return board.form === 'table_fill' ? 'typed' : 'tapped';
}

/**
 * Ihre Anordnung in einer Zeile, so wie der Server sie in `items.answer` schreibt — das ist,
 * was im Gespräch stehen soll, während die Antwort unterwegs ist (optimistisch, issue #163).
 */
export function renderBoardAnswer(board: PartsBoard, answer: BoardAnswer): string {
  const textOf = (pieces: readonly BoardPiece[], ref: string | undefined): string =>
    pieces.find((piece) => piece.ref === ref)?.text ?? '';
  switch (board.form) {
    case 'order':
      return orderSequence(answer)
        .map((ref) => textOf(board.elements, ref))
        .join(' → ');
    case 'match_pairs':
      return board.left
        .filter((piece) => filled(answer, piece.ref))
        .map((piece) => `${piece.text} – ${textOf(board.right, answer.get(piece.ref))}`)
        .join('; ');
    case 'match_groups':
      return board.groups
        .map((group) => ({
          group,
          members: board.elements.filter((piece) => answer.get(piece.ref) === group.ref),
        }))
        .filter(({ members }) => members.length > 0)
        .map(({ group, members }) => `${group.text}: ${members.map((m) => m.text).join(', ')}`)
        .join(' · ');
    case 'table_fill':
      return gapsOf(board)
        .map((gap) => (answer.get(gap.ref) ?? '').trim())
        .filter((value) => value !== '')
        .join('; ');
  }
}

// ─────────────── ein Stück auf dem Brett ───────────────

/**
 * Der Marker auf einem Stück: 24 pt, weil er eine SCHRIFTGRÖSSE ist und kein Abstand — das
 * Tippziel ist der Chip, dessen Höhe `Btn` bei `TOUCH` hält. Dieselbe Begründung wie beim
 * runden Buchstaben der Antwortkarten (`ChoiceList.tsx`, issue #203).
 */
const MARK = 24;

/** Noch nichts gesetzt, und: wartet auf ihren zweiten Tipp. Zeichen, keine Wörter. */
const MARK_UNSET = '–';
const MARK_OPEN = '…';

/**
 * Die Zeile, in der die Stücke umbrechen. `SPACE.xs` und nicht `SPACE.sm` (die eine Skala,
 * issue #64, mit Begründung): das hier ist eine dichte Reihe von Tippzielen, keine Gliederung
 * zwischen Blöcken — bei acht Stücken untereinander sind die 4 pt Unterschied 28 pt, und so
 * viel entscheidet auf einem 360×740-Handy über eine Zeile mehr oder weniger (Regel 16).
 */
const CHIP_ROW = { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs } as const;

function Mark({ text, strong }: { text: string; strong: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        minWidth: MARK,
        height: MARK,
        borderRadius: MARK / 2,
        paddingHorizontal: SPACE.xs,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: strong ? palette.primary : palette.canvas,
      }}
    >
      <Text
        numberOfLines={1}
        style={[TYPE.label, { color: strong ? palette.paper : palette.ink2 }]}
      >
        {text}
      </Text>
    </View>
  );
}

type PieceProps = {
  /** Was ein Screenreader hört: was es ist, wie es steht, was ein Tipp tut. */
  name: string;
  hint?: string | undefined;
  /** Der Text auf dem Marker; `null` bei einem Stück, dessen Platz selbst der Zustand ist. */
  mark: string | null;
  text: string;
  /** Gesetzt, zugeordnet, einsortiert — das Stück trägt Farbe UND seinen Marker. */
  set: boolean;
  /** Füllt seine Spalte (die beiden Seiten einer Zuordnung) statt inhaltsbreit zu stehen. */
  full?: boolean;
  disabled: boolean;
  onPress: () => void;
};

/**
 * Ein Stück. `Btn` und nicht ein nacktes `Pressable` (CLAUDE.md Regel 13): es ist eine
 * Antwortkarte wie die der Auswahlfragen, mit derselben Höhe (`TOUCH`), demselben
 * Tippverhalten und derselben Regel, dass die Fläche auf der inneren View liegt. Der Name
 * geht als `children` hinein — `Btn` nimmt ihn als zugänglichen Namen, und `label` zeichnet,
 * was zu sehen ist.
 */
function Piece({ name, hint, mark, text, set, full = false, disabled, onPress }: PieceProps) {
  const { palette } = useTheme();
  return (
    <View style={full ? { alignSelf: 'stretch' } : { maxWidth: '100%', flexShrink: 1 }}>
      <Btn
        size="sm"
        pill
        compact
        full={full}
        variant={set ? 'soft' : 'outline'}
        disabled={disabled}
        onPress={onPress}
        {...(hint === undefined ? {} : { accessibilityHint: hint })}
        label={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            {mark === null ? null : <Mark text={mark} strong={set} />}
            <MathText
              text={text}
              accessible={false}
              style={[TYPE.small, { color: palette.ink, fontWeight: '500' }]}
            />
          </View>
        }
      >
        {name}
      </Btn>
    </View>
  );
}

/** Die Zeile unter dem Brett: wie weit sie ist, in Worten (wie beim Bruchbalken). */
function Progress({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
      {children}
    </Text>
  );
}

/** Die eine Zeile über dem Brett, die sagt, was zu tun ist. */
function How({ children }: { children: string }) {
  const { palette } = useTheme();
  return <Text style={[TYPE.small, { color: palette.ink2 }]}>{children}</Text>;
}

// ─────────────── das Brett ───────────────

type Props = {
  board: PartsBoard;
  answer: BoardAnswer;
  disabled: boolean;
  onChange: (next: BoardAnswer) => void;
};

export function PartsBoardAnswer({ board, answer, disabled, onChange }: Props): ReactElement {
  const rest = { answer, disabled, onChange };
  switch (board.form) {
    case 'order':
      return <OrderBoard board={board} {...rest} />;
    case 'match_pairs':
      return <PairsBoard board={board} {...rest} />;
    case 'match_groups':
      return <GroupsBoard board={board} {...rest} />;
    case 'table_fill':
      return <TableBoard board={board} {...rest} />;
  }
}

// ─────────────── order ───────────────

function OrderBoard({
  board,
  answer,
  disabled,
  onChange,
}: Props & { board: Extract<PartsBoard, { form: 'order' }> }) {
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const sequence = orderSequence(answer);
  // Ein Tipp auf ein gesetztes Stück nimmt es heraus, und alles dahinter rutscht eine
  // Nummer vor — die Folge wird neu gebaut, nicht einzeln umgeschrieben.
  const tap = (ref: string) => {
    const at = sequence.indexOf(ref);
    onChange(fromSequence(at === -1 ? [...sequence, ref] : sequence.filter((r) => r !== ref)));
  };
  return (
    <View style={{ gap: SPACE.sm }}>
      <How>{t('board.order_how')}</How>
      <View style={CHIP_ROW}>
        {board.elements.map((piece, index) => {
          const at = sequence.indexOf(piece.ref);
          const spoken = speakMathText(piece.text, words);
          return (
            <Piece
              key={piece.ref}
              mark={at === -1 ? MARK_UNSET : String(at + 1)}
              text={piece.text}
              set={at !== -1}
              disabled={disabled}
              onPress={() => tap(piece.ref)}
              name={
                at === -1
                  ? t('board.order_unset', {
                      text: spoken,
                      n: index + 1,
                      total: board.elements.length,
                    })
                  : t('board.order_set', { text: spoken, position: at + 1 })
              }
            />
          );
        })}
      </View>
      <Progress>
        {t('board.order_state', { placed: sequence.length, total: board.elements.length })}
      </Progress>
    </View>
  );
}

// ─────────────── match_pairs ───────────────

function PairsBoard({
  board,
  answer,
  disabled,
  onChange,
}: Props & { board: Extract<PartsBoard, { form: 'match_pairs' }> }) {
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  /** Welche linke Seite auf ihre rechte wartet — ein Blick, kein Teil der Antwort. */
  const [open, setOpen] = useState<string | null>(null);

  /** Die Paare in der Folge, in der sie sie gebildet hat: die Nummer ist diese Folge. */
  const lefts = [...answer.keys()].filter((slot) => filled(answer, slot));
  const pairOf = (left: string): number | null => {
    const at = lefts.indexOf(left);
    return at === -1 ? null : at + 1;
  };
  const leftOfRight = (right: string): string | null =>
    lefts.find((left) => answer.get(left) === right) ?? null;

  const dissolve = (left: string) => {
    onChange(new Map([...answer].filter(([slot]) => slot !== left)));
    if (open === left) setOpen(null);
  };

  const tapLeft = (ref: string) => {
    if (pairOf(ref) !== null) return dissolve(ref);
    setOpen(open === ref ? null : ref);
  };
  const tapRight = (ref: string) => {
    const paired = leftOfRight(ref);
    if (paired !== null) return dissolve(paired);
    // Ohne offene linke Seite tut ein Tipp nichts — der Hinweis am Stück sagt, was fehlt.
    if (open === null) return;
    onChange(new Map(answer).set(open, ref));
    setOpen(null);
  };

  return (
    <View style={{ gap: SPACE.sm }}>
      <How>{t('board.pairs_how')}</How>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          {board.left.map((piece) => {
            const pair = pairOf(piece.ref);
            const waiting = open === piece.ref;
            const spoken = speakMathText(piece.text, words);
            return (
              <Piece
                key={piece.ref}
                full
                mark={pair === null ? (waiting ? MARK_OPEN : MARK_UNSET) : String(pair)}
                text={piece.text}
                set={pair !== null || waiting}
                disabled={disabled}
                onPress={() => tapLeft(piece.ref)}
                name={
                  pair !== null
                    ? t('board.pairs_left_done', { text: spoken, pair })
                    : waiting
                      ? t('board.pairs_left_open', { text: spoken })
                      : t('board.pairs_left', { text: spoken })
                }
              />
            );
          })}
        </View>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          {board.right.map((piece) => {
            const left = leftOfRight(piece.ref);
            const pair = left === null ? null : pairOf(left);
            const spoken = speakMathText(piece.text, words);
            return (
              <Piece
                key={piece.ref}
                full
                mark={pair === null ? MARK_UNSET : String(pair)}
                text={piece.text}
                set={pair !== null}
                disabled={disabled}
                onPress={() => tapRight(piece.ref)}
                name={
                  pair === null
                    ? t('board.pairs_right', { text: spoken })
                    : t('board.pairs_right_done', { text: spoken, pair })
                }
                // Kein totes Bedienelement: ohne offene linke Seite sagt das Stück selbst,
                // was zuerst dran ist, statt stumm zu bleiben.
                hint={pair === null && open === null ? t('board.pairs_pick_left') : undefined}
              />
            );
          })}
        </View>
      </View>
      <Progress>
        {t('board.pairs_state', { done: lefts.length, total: board.left.length })}
      </Progress>
    </View>
  );
}

// ─────────────── match_groups ───────────────

function GroupsBoard({
  board,
  answer,
  disabled,
  onChange,
}: Props & { board: Extract<PartsBoard, { form: 'match_groups' }> }) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  /** Welches Element auf seine Gruppe wartet — ein Blick, kein Teil der Antwort. */
  const [open, setOpen] = useState<string | null>(null);

  const loose = board.elements.filter((piece) => !filled(answer, piece.ref));
  const sorted = board.elements.filter((piece) => filled(answer, piece.ref));

  const take = (ref: string) => {
    onChange(new Map([...answer].filter(([slot]) => slot !== ref)));
    if (open === ref) setOpen(null);
  };
  const tapElement = (ref: string) => {
    if (filled(answer, ref)) return take(ref);
    setOpen(open === ref ? null : ref);
  };
  const tapGroup = (group: string) => {
    // Ohne gewähltes Element tut ein Tipp nichts — der Hinweis sagt, was zuerst dran ist.
    if (open === null) return;
    onChange(new Map(answer).set(open, group));
    setOpen(null);
  };

  return (
    <View style={{ gap: SPACE.sm }}>
      <How>{t('board.groups_how')}</How>
      {loose.length > 0 ? (
        // Was noch nicht einsortiert ist, trägt KEINEN Marker: dass es draußen steht, ist
        // sein Zustand, und der Marker wäre hier nur 32 pt Breite pro Stück — bei zwölf
        // Elementen sind das zwei Zeilen mehr auf einem 360×740-Handy (Regel 16). Nur das
        // gewählte trägt eines, und das ist genau das Stück, das als Nächstes das Fach
        // wechselt; dass es dabei breiter wird, gehört zu dieser Bewegung.
        <View style={CHIP_ROW}>
          {loose.map((piece) => {
            const spoken = speakMathText(piece.text, words);
            const waiting = open === piece.ref;
            return (
              <Piece
                key={piece.ref}
                mark={waiting ? MARK_OPEN : null}
                text={piece.text}
                set={waiting}
                disabled={disabled}
                onPress={() => tapElement(piece.ref)}
                name={
                  waiting
                    ? t('board.groups_open', { text: spoken })
                    : t('board.groups_unset', { text: spoken })
                }
              />
            );
          })}
        </View>
      ) : null}
      {/* Die Fächer stehen enger beieinander als die Blöcke des Bretts (SPACE.xs statt
          SPACE.sm): sie sind EIN Satz von Zielen, und auf einem 360×740-Handy sind die vier
          Punkte, die das spart, vier Punkte, die das Gespräch darüber behält. */}
      <View style={{ gap: SPACE.xs }}>
        {board.groups.map((group) => (
          // Ein Fach: der Gruppenname als Ziel, dahinter, was schon darin liegt. Die
          // Mitglieder stehen NEBEN dem Ziel und nicht darin — ein Knopf in einem Knopf ist
          // auf dem Web ungültig und axe nennt es („nested-interactive").
          <View
            key={group.ref}
            style={[
              { backgroundColor: palette.canvas, borderRadius: 16, padding: SPACE.xs },
              CHIP_ROW,
              { alignItems: 'center' },
            ]}
          >
            <Btn
              size="sm"
              compact
              variant="soft"
              disabled={disabled}
              onPress={() => tapGroup(group.ref)}
              {...(open === null ? { accessibilityHint: t('board.groups_pick_element') } : {})}
              label={
                <MathText
                  text={group.text}
                  accessible={false}
                  style={[TYPE.small, { color: palette.primaryDk, fontWeight: '700' }]}
                />
              }
            >
              {t('board.groups_target', { group: speakMathText(group.text, words) })}
            </Btn>
            {sorted
              .filter((piece) => answer.get(piece.ref) === group.ref)
              .map((piece) => (
                <Piece
                  key={piece.ref}
                  // Der Platz IST hier der Zustand: das Stück liegt im Fach seiner Gruppe,
                  // und sein Name sagt dasselbe noch einmal in Worten.
                  mark={null}
                  text={piece.text}
                  set
                  disabled={disabled}
                  onPress={() => take(piece.ref)}
                  name={t('board.groups_set', {
                    text: speakMathText(piece.text, words),
                    group: speakMathText(group.text, words),
                  })}
                />
              ))}
          </View>
        ))}
      </View>
      <Progress>
        {t('board.groups_state', { done: sorted.length, total: board.elements.length })}
      </Progress>
    </View>
  );
}

// ─────────────── table_fill ───────────────

/**
 * Wie schmal eine Spalte werden darf, bevor die Tabelle quer geschoben wird.
 *
 * Gerechnet, nicht geschätzt, mit derselben gemessenen Breite pro Zeichen, auf die sich die
 * Antwortkarten stützen (`ChoiceList.tsx`: 0,64 em bei der Schrift, in der sie gemessen
 * wurde): acht Zeichen bei 15 pt sind 8 × 15 × 0,64 = 77 pt, dazu die 2 × 8 pt Polster der
 * Zelle = 93. Acht Zeichen, weil das die längste Form ist, die in eine Lücke gehört
 * (`expect` ist eine Zahl oder ein kurzes Wort, nie ein Satz — `parts.ts`).
 */
const MIN_COL = 93;

/** Die Zelle einer Tabelle: dieselben Linien, Radien und der Kopfton wie `FigureView`. */
const CELL_PAD = SPACE.sm;

function TableBoard({
  board,
  answer,
  disabled,
  onChange,
}: Props & { board: Extract<PartsBoard, { form: 'table_fill' }> }) {
  const { palette, figure: ink } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const cols = Math.max(board.header.length, ...board.rows.map((row) => row.length));
  const gaps = gapsOf(board);
  /** Was die Tabelle an Breite hat; 0, solange noch nichts ausgelegt ist. */
  const [room, setRoom] = useState(0);
  /**
   * Quer geschoben wird nur, wenn die Tabelle wirklich breiter ist als ihr Platz — gemessen,
   * nicht vorsorglich: eine Tabelle mit zwei Spalten in einen Schieber zu wickeln, nimmt ihr
   * die Breite, die sie hat. Solange nichts gemessen ist, teilen sich die Spalten den Platz.
   */
  const tight = room > 0 && cols * MIN_COL > room;

  /** Welche Lücke gerade geschrieben wird, und wo darin ihr Cursor steht. */
  const [focus, setFocus] = useState<string | null>(null);
  const selection = useRef<Selection | null>(null);
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const inputs = useRef(new Map<string, TextInput | null>());

  const set = (ref: string, value: string) => onChange(new Map(answer).set(ref, value));

  /** Eine Rechentaste schreibt an den Cursor der Lücke, genau wie im Antwortfeld. */
  const insert = (insertion: Insertion) => {
    if (focus === null) return;
    const next = insertAtCursor(answer.get(focus) ?? '', selection.current, insertion);
    if (next.value.length > MAX_PART_VALUE) return;
    selection.current = next.selection;
    set(focus, next.value);
    setForced(next.selection);
    inputs.current.get(focus)?.focus();
  };

  /**
   * Wo die Lücke steht, in Worten. Zuerst die beiden Namen, die eine Tabelle selbst hergibt:
   * ihr Spaltenkopf und das erste, was in ihrer Zeile GEDRUCKT steht („Präsens bei ich").
   * Fehlt einer davon, wird gezählt — eine Zeilen- oder Spaltennummer ist blass, aber sie ist
   * eindeutig, und eine Lücke ohne Namen wäre nicht bedienbar.
   */
  const where = (row: number, col: number): string => {
    const heading = (board.header[col] ?? '').trim();
    const label = (
      board.rows[row]?.find(
        (cell): cell is Extract<BoardCell, { cell: 'given' }> =>
          cell.cell === 'given' && cell.text.trim() !== '',
      )?.text ?? ''
    ).trim();
    if (heading !== '' && label !== '')
      return t('board.table_where', {
        column: speakMathText(heading, words),
        row: speakMathText(label, words),
      });
    if (heading !== '')
      return t('board.table_where_col', { column: speakMathText(heading, words), row: row + 1 });
    return t('board.table_where_cell', { column: col + 1, row: row + 1 });
  };

  const cellBox = (last: boolean) => ({
    ...(tight ? { width: MIN_COL } : { flex: 1, minWidth: 0 }),
    paddingHorizontal: CELL_PAD,
    borderRightWidth: last ? 0 : 1,
    borderColor: ink.gridStrong,
    justifyContent: 'center' as const,
  });

  const gapCell = (cell: Extract<BoardCell, { cell: 'gap' }>, row: number, col: number) => {
    const at = gaps.findIndex((gap) => gap.ref === cell.ref);
    const next = gaps[at + 1];
    const value = answer.get(cell.ref) ?? '';
    const spot = where(row, col);
    return (
      <TextInput
        ref={(el) => {
          inputs.current.set(cell.ref, el);
        }}
        value={value}
        onChangeText={(typed) => set(cell.ref, typed)}
        editable={!disabled}
        accessibilityLabel={
          value.trim() === ''
            ? t('board.table_empty', { where: spot })
            : t('board.table_filled', { where: spot, value: value.trim() })
        }
        {...(focus === cell.ref && forced ? { selection: forced } : {})}
        onSelectionChange={(e) => {
          selection.current = e.nativeEvent.selection;
          if (forced) setForced(undefined);
        }}
        onFocus={() => setFocus(cell.ref)}
        onBlur={() => setFocus((current) => (current === cell.ref ? null : current))}
        maxLength={MAX_PART_VALUE}
        // Nichts „verbessern": was sie in eine Lücke schreibt, ist eine Form, kein Satz
        // (dieselbe Begründung wie im Antwortfeld, `AnswerComposer.tsx`).
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="none"
        keyboardType={keyboardFor(cell.expect)}
        // Leserichtung: die Eingabetaste springt in die nächste Lücke, die letzte schließt ab.
        returnKeyType={next ? 'next' : 'done'}
        submitBehavior={next ? 'submit' : 'blurAndSubmit'}
        onSubmitEditing={() => {
          if (next) inputs.current.get(next.ref)?.focus();
        }}
        style={{
          // Die Lücke IST das Tippziel: so hoch wie ein Knopf (`TOUCH`), nie knapper.
          height: TOUCH,
          minWidth: 0,
          paddingHorizontal: 0,
          backgroundColor: 'transparent',
          fontSize: 15,
          lineHeight: 21,
          fontWeight: '600',
          color: palette.primaryDk,
          outlineWidth: 0,
        }}
      />
    );
  };

  const table = (
    <View
      style={{
        alignSelf: tight ? 'flex-start' : 'auto',
        borderWidth: 1,
        borderColor: ink.gridStrong,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: palette.lavender,
          borderColor: ink.gridStrong,
        }}
      >
        {Array.from({ length: cols }, (_, col) => (
          <View key={col} style={cellBox(col === cols - 1)}>
            <MathText
              accessible={false}
              text={board.header[col] ?? ''}
              style={[TYPE.small, { fontWeight: '700', paddingVertical: CELL_PAD }]}
            />
          </View>
        ))}
      </View>
      {board.rows.map((row, r) => (
        <View
          key={r}
          style={{
            flexDirection: 'row',
            backgroundColor: ink.paper,
            borderTopWidth: 1,
            borderColor: ink.gridStrong,
          }}
        >
          {Array.from({ length: cols }, (_, col) => {
            const cell = row[col];
            return (
              <View key={col} style={cellBox(col === cols - 1)}>
                {cell && cell.cell === 'gap' ? (
                  gapCell(cell, r, col)
                ) : (
                  <MathText
                    accessible={false}
                    text={cell?.text ?? ''}
                    style={[TYPE.small, { color: palette.ink, paddingVertical: CELL_PAD }]}
                  />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  const done = gaps.filter((gap) => filled(answer, gap.ref)).length;
  // Only the keys the focused gap needs: none for a word, none for a whole number (the phone's
  // digits write it — issue #286 finding 5), the number signs otherwise (lib/math/keys.ts).
  const focused = focus === null ? undefined : gaps.find((gap) => gap.ref === focus);
  const keys = focused ? cellKeys(focused.expect, focused.whole) : [];
  return (
    <View style={{ gap: SPACE.sm }}>
      <How>{t('board.table_how')}</How>
      <View onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))}>
        {tight ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {table}
          </ScrollView>
        ) : (
          table
        )}
      </View>
      <Progress>{t('board.table_state', { done, total: gaps.length })}</Progress>
      {/* Tastaturzubehör, kein Möbel (issue #16): die Rechentasten stehen nur da, während
          sie in eine Zahlenlücke schreibt — und dann unten, wo die Tastatur ist. */}
      {keys.length > 0 ? <MathKeys keys={keys} onInsert={insert} disabled={disabled} /> : null}
    </View>
  );
}

/** Dieselbe Wahl wie im Antwortfeld: iOS' Zahlenblock kennt kein Minus und kein Komma. */
function keyboardFor(expect: 'number' | 'word'): KeyboardTypeOptions {
  return expect === 'number' && Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default';
}
