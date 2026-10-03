// Zuordnen (issue #229). Paare: zwei Spalten, links antippen, dann rechts (oder andersherum
// — niemand muss eine Richtung lernen); beide tragen dann dieselbe Pastellfarbe UND dasselbe
// Zeichen (● ▲ ■ ◆), damit ein Paar auf einen Blick zu sehen ist und Farbe nie das einzige Signal
// ist (#286; vorher eine Nummer im Text, das Brett wirkte wie ein Formular). Gruppen: oben, was noch einzusortieren ist, darunter je Gruppe eine Zeile mit
// ihrem Namen; ein Ding antippen, dann seine Gruppe — und es wandert IN deren Zeile, neben
// den Namen. Der Kasten ist der Zustand: keine Nummer, die sie einer Legende zuordnen müsste
// (die Darstellung stammt aus dem ersetzten `parts`-Brett, #224). Ein Tipp auf etwas
// Zugeordnetes löst es wieder: rückgängig statt bestätigen (docs/UX-PRINCIPLES.md). Sind alle
// zugeordnet, schickt „Prüfen" die Verbindungen als `parts`; geprüft wird auf dem Server, exakt
// und ohne Modell (apps/api/src/modules/practice/structured.ts).
//
// Platz (Regel 16, 360×740): vier Paare in zwei Spalten sind vier Zeilen statt acht; die beiden
// Kacheln einer Zeile sind gleich hoch, die Spalten fast gleich breit (42–58 %, nach den längsten
// Wörtern). Der Text steht links und bricht an Wortgrenzen um, nie mitten im Wort (kein Wort ist
// länger als MATCH_WORD_MAX). Wie viel hier höchstens steht, ist gemessen, nicht gewählt:
// die MATCH_*-Grenzen in contracts/structured.ts passen ohne Scrollen auf 360×740.
//
// Farbe ist nie das einzige Signal: die Nummer bzw. die Zeile sagt die Zuordnung, und ein
// Screenreader hört sie in Worten („…, Paar 2 mit …" bzw. „…, in Nomen"). Mehr gibt es nicht —
// eine Zeile Anleitung bis zum ersten Tipp, die Elemente, „Prüfen" (Minimalismus, Owner
// 02.10.). Auch was sie gerade hält, steht im Entwurf: ein Themenwechsel baut den Baum neu auf
// (ThemeProvider).

import type { MatchTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { BottomBar } from './BottomBar.js';
import { PartsArea } from './PartsArea.js';

/** One link she made: an element above, the partner or group below, and its number. */
export type Link = { left: string; right: string; n: number };

/** What she is holding (tapped, not yet linked), and what she has linked. */
export type MatchState = { links: Link[]; held: string | null };

/** The smallest pair number not taken: a dissolved pair's number is free again. */
function freeNumber(links: readonly Link[]): number {
  let n = 1;
  while (links.some((k) => k.n === n)) n += 1;
  return n;
}

/**
 * One tap, as a pure step (the component test and the screen use the same one):
 *   · on something linked: the link dissolves;
 *   · on what she holds: she lets go;
 *   · on the other side while holding: the two are linked;
 *   · otherwise: she holds it (a group is never held — it only receives).
 */
export function tapMatch(
  view: Pick<MatchTaskView, 'form' | 'left' | 'right'>,
  state: MatchState,
  id: string,
): MatchState {
  const isLeft = view.left.some((e) => e.id === id);
  const groups = view.form === 'groups';
  const linked = state.links.find((k) => k.left === id || (!groups && k.right === id));
  if (linked) return { links: state.links.filter((k) => k !== linked), held: null };
  if (state.held === id) return { ...state, held: null };
  const heldLeft = state.held !== null && view.left.some((e) => e.id === state.held);
  const heldRight = state.held !== null && !heldLeft;
  if (isLeft && heldRight) {
    return {
      links: [...state.links, { left: id, right: state.held!, n: freeNumber(state.links) }],
      held: null,
    };
  }
  if (!isLeft && heldLeft) {
    const n = groups ? view.right.findIndex((g) => g.id === id) + 1 : freeNumber(state.links);
    return { links: [...state.links, { left: state.held!, right: id, n }], held: null };
  }
  if (!isLeft && groups) return state;
  return { ...state, held: id };
}

/**
 * Her links and what she holds, as kept in the draft (JSON). Both are kept: a theme change
 * remounts the tree (ThemeProvider), and a tap she already made must not be lost to it.
 * Anything that is not part of this task is left out: an unknown id, a left element twice, a
 * partner twice (pairs), a held element that is linked or a group.
 */
export function stateFrom(
  kept: string,
  view: Pick<MatchTaskView, 'form' | 'left' | 'right'>,
): MatchState {
  try {
    const stored: unknown = JSON.parse(kept || '{}');
    if (typeof stored !== 'object' || stored === null) return { links: [], held: null };
    const { links: list, held } = stored as Record<string, unknown>;
    const links = linksFrom(list, view);
    const holdable =
      typeof held === 'string' &&
      (view.left.some((e) => e.id === held) ||
        (view.form === 'pairs' && view.right.some((e) => e.id === held))) &&
      !links.some((k) => k.left === held || k.right === held);
    return { links, held: holdable ? held : null };
  } catch {
    return { links: [], held: null };
  }
}

function linksFrom(list: unknown, view: Pick<MatchTaskView, 'form' | 'left' | 'right'>): Link[] {
  const left = new Set(view.left.map((e) => e.id));
  const right = new Set(view.right.map((e) => e.id));
  if (!Array.isArray(list)) return [];
  const out: Link[] = [];
  for (const x of list) {
    if (typeof x !== 'object' || x === null) continue;
    const { left: l, right: r, n } = x as Record<string, unknown>;
    if (typeof l !== 'string' || typeof r !== 'string' || typeof n !== 'number') continue;
    if (!left.has(l) || !right.has(r) || out.some((k) => k.left === l)) continue;
    if (view.form === 'pairs' && out.some((k) => k.right === r || k.n === n)) continue;
    out.push({ left: l, right: r, n });
  }
  return out;
}

/** The links in words, as the server writes them ("A – 1; B – 2" / "Nomen: Haus, Baum"). */
export function linksText(view: MatchTaskView, links: readonly Link[]): string {
  const text = new Map([...view.left, ...view.right].map((e) => [e.id, e.text]));
  const at = new Map(view.left.map((e, i) => [e.id, i]));
  const sorted = [...links].sort((a, b) => (at.get(a.left) ?? 0) - (at.get(b.left) ?? 0));
  if (view.form === 'pairs') {
    return sorted.map((k) => `${text.get(k.left)} – ${text.get(k.right)}`).join('; ');
  }
  return view.right
    .map((g) => {
      const members = sorted.filter((k) => k.right === g.id).map((k) => text.get(k.left));
      return members.length === 0 ? null : `${g.text}: ${members.join(', ')}`;
    })
    .filter((x): x is string => x !== null)
    .join('; ');
}

/**
 * How a formed pair looks (issue #286): both of its tiles wear the same pastel tint AND the same
 * symbol, so the pair is seen at a glance and colour is never the only signal (CLAUDE.md). One
 * per pair, by its number; a pairing has at most MATCH_PAIRS_MAX (4) pairs. The tints are the
 * subject tones (`useTheme().tones`), never a free colour; lavender stays out, it is the colour
 * of a tile that has no partner yet.
 */
const PAIR_LOOKS: ReadonlyArray<{ tone: SubjectTone; symbol: string }> = [
  { tone: 'sky', symbol: '●' },
  { tone: 'mint', symbol: '▲' },
  { tone: 'peach', symbol: '■' },
  { tone: 'blush', symbol: '◆' },
];

/** The look of pair n (1-based); wraps around rather than failing for an old, larger task. */
export function pairLook(n: number): { tone: SubjectTone; symbol: string } {
  return PAIR_LOOKS[(n - 1) % PAIR_LOOKS.length]!;
}

/** The width kept for a pair's symbol, so a tile's text does not move when it is paired. */
const SYMBOL = 16;

/**
 * How wide the left column of a pairing is: as much as its longest word needs next to the
 * right column's longest word, between 34 % and 66 %. Purely the layout: a word cannot be
 * broken, so the longest words decide the split.
 */
export function leftShare(left: readonly string[], right: readonly string[]): number {
  const longest = (texts: readonly string[]) =>
    Math.max(1, ...texts.flatMap((x) => x.split(/\s+/)).map((w) => w.length));
  const l = longest(left);
  const r = longest(right);
  return Math.min(0.66, Math.max(0.34, l / (l + r)));
}

type Props = {
  view: MatchTaskView;
  /** Where her links are kept (`lib/drafts.ts`), like an order's arrangement. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": everything linked; `shown` is her links in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function MatchAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();
  const { text: kept, setText: keep } = useDraft(draftKey);
  const { links, held } = stateFrom(kept, view);
  const groups = view.form === 'groups';
  const complete = links.length === view.left.length;
  const text = new Map([...view.left, ...view.right].map((e) => [e.id, e.text]));
  const spoken = (id: string) => speakMathText(text.get(id) ?? '', words);
  const heldIsLeft = held !== null && view.left.some((e) => e.id === held);
  const started = links.length > 0 || held !== null;
  /** A grouping's elements not in a group yet: they stand above the groups. */
  const unsorted = view.left.filter((e) => !links.some((k) => k.left === e.id));

  const tap = (id: string) =>
    keep((now) => JSON.stringify(tapMatch(view, stateFrom(now, view), id)));

  /** One element above or one partner below: its number, its state in words. */
  const element = (id: string, side: 'left' | 'right') => {
    const link = links.find((k) => (side === 'left' ? k.left === id : k.right === id));
    const isHeld = held === id;
    const other = link ? spoken(side === 'left' ? link.right : link.left) : '';
    const me = spoken(id);
    const label = isHeld
      ? t('match.held', { text: me })
      : link
        ? groups
          ? t('match.in_group', { text: me, group: other })
          : t('match.paired', { text: me, n: link.n, other })
        : groups
          ? t('match.no_group', { text: me })
          : t('match.no_partner', { text: me });
    const hint = link
      ? t('match.hint_linked')
      : isHeld
        ? t('match.hint_held')
        : held !== null && (side === 'left') !== heldIsLeft
          ? t('match.hint_link', { other: spoken(held) })
          : t('match.hint_take');
    return (
      <View key={id} style={{ maxWidth: '100%' }}>
        <Btn
          variant={isHeld ? 'primary' : link ? 'soft' : 'outline'}
          size="sm"
          // A column's element fills it; a grouping's element is as wide as its word.
          full={!groups}
          compact
          disabled={disabled}
          onPress={() => tap(id)}
          accessibilityLabel={label}
          accessibilityHint={hint}
          label={
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACE.xs,
                // In a column every point counts: the label reaches SPACE.xs into the
                // button's compact padding (12 → 8 at each side), so a long word fits.
                ...(groups ? {} : { marginHorizontal: -SPACE.xs }),
              }}
            >
              <MathText
                text={text.get(id) ?? ''}
                accessible={false}
                style={{
                  // Two lines still fit the 44 pt of one element; the text wraps beside the
                  // number, at word boundaries (no word is longer than MATCH_WORD_MAX).
                  flexShrink: 1,
                  paddingVertical: SPACE.xs,
                  textAlign: 'center',
                  color: isHeld ? palette.paper : link ? palette.primaryDk : palette.ink,
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: '600',
                }}
              />
            </View>
          }
        >
          {me}
        </Btn>
      </View>
    );
  };

  /**
   * One tile of a pairing (issue #286). Unpaired it is a calm lilac tile; held, it is filled; in
   * a pair it wears the pair's tint and symbol — the same on both sides. The text stands left,
   * the symbol at the end, so nothing is read as part of the word.
   */
  const pairTile = (id: string, side: 'left' | 'right') => {
    const link = links.find((k) => (side === 'left' ? k.left === id : k.right === id));
    const isHeld = held === id;
    const look = link ? pairLook(link.n) : null;
    const me = spoken(id);
    const other = link ? spoken(side === 'left' ? link.right : link.left) : '';
    return (
      <Btn
        key={id}
        variant={isHeld ? 'primary' : 'soft'}
        {...(look && !isHeld ? { tone: look.tone } : {})}
        size="sm"
        full
        grow
        compact
        disabled={disabled}
        onPress={() => tap(id)}
        accessibilityLabel={
          isHeld
            ? t('match.held', { text: me })
            : link
              ? t('match.paired', { text: me, n: link.n, other })
              : t('match.no_partner', { text: me })
        }
        accessibilityHint={
          link
            ? t('match.hint_linked')
            : isHeld
              ? t('match.hint_held')
              : held !== null && (side === 'left') !== heldIsLeft
                ? t('match.hint_link', { other: spoken(held) })
                : t('match.hint_take')
        }
        label={
          // Like a group's element: the label reaches SPACE.xs into the compact padding and
          // carries SPACE.xs above and below, so two lines still fit the 44 pt of one tile and
          // four pairs of the longest texts fit a 360×740 phone (no `wrap`: its 12 pt each side
          // pushed the board under the bar).
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.xs,
              marginHorizontal: -SPACE.xs,
            }}
          >
            <MathText
              text={text.get(id) ?? ''}
              accessible={false}
              style={{
                flex: 1,
                paddingVertical: SPACE.xs,
                color: isHeld ? palette.paper : link ? palette.ink : palette.primaryDk,
                fontSize: 14,
                lineHeight: 18,
                fontWeight: '600',
              }}
            />
            <Text
              accessible={false}
              importantForAccessibility="no"
              style={{
                width: SYMBOL,
                textAlign: 'center',
                fontSize: 16,
                lineHeight: 18,
                // The shape carries the pair; it is drawn in ink, not in the pale tint.
                color: look ? palette.ink2 : 'transparent',
              }}
            >
              {look?.symbol ?? ''}
            </Text>
          </View>
        }
      >
        {me}
      </Btn>
    );
  };

  /**
   * A group: one row, its name first and then what she has put in it. The row IS the state —
   * no number to look up. The name takes what she holds; an element in the row goes back out
   * with a tap. The elements stand NEXT to the name, not inside it: a button in a button is
   * invalid on the web (axe: nested-interactive).
   */
  const group = (id: string) => {
    const name = spoken(id);
    const members = view.left.filter((e) => links.some((k) => k.left === e.id && k.right === id));
    return (
      <View
        key={id}
        testID={`match-group-${id}`}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: SPACE.sm,
          padding: SPACE.xs,
          borderRadius: SPACE.lg,
          backgroundColor: palette.canvas,
        }}
      >
        <Btn
          variant="soft"
          size="sm"
          compact
          // A group only receives: without something held there is nothing to put in it.
          disabled={disabled || !heldIsLeft}
          onPress={() => tap(id)}
          accessibilityLabel={t('match.group', { group: name, count: members.length })}
          accessibilityHint={
            heldIsLeft ? t('match.hint_put', { text: spoken(held!) }) : t('match.hint_group_waits')
          }
          label={
            <MathText
              text={text.get(id) ?? ''}
              accessible={false}
              style={{
                paddingVertical: SPACE.xs,
                color: heldIsLeft && !disabled ? palette.primaryDk : palette.ink2,
                fontSize: 14,
                lineHeight: 18,
                fontWeight: '700',
              }}
            />
          }
        >
          {name}
        </Btn>
        {members.map((e) => element(e.id, 'left'))}
      </View>
    );
  };

  // A pairing's columns are near-equal (issue #286: a narrow right column wrapped every phrase
  // into three lines); only a long word may move the split, and then within 42–58 %.
  const pairShare = (l: number) => Math.min(0.58, Math.max(0.42, l));
  const share = leftShare(
    view.left.map((e) => e.text),
    view.right.map((e) => e.text),
  );

  return (
    <>
      <PartsArea>
        <View style={{ gap: SPACE.sm }}>
          {/* The one line of instruction, only until she has started (like an order's). */}
          {started ? null : (
            <Text style={[TYPE.small, { color: palette.ink2 }]}>
              {t(groups ? 'match.how_groups' : 'match.how_pairs')}
            </Text>
          )}
          {groups ? (
            <>
              {/* What is still to be sorted; it empties as she sorts, and then it is gone. */}
              {unsorted.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                  {unsorted.map((e) => element(e.id, 'left'))}
                </View>
              ) : null}
              <View style={{ gap: SPACE.xs }}>{view.right.map((g) => group(g.id))}</View>
            </>
          ) : (
            // Pairs: two columns of rows, so four pairs are four rows, and the two tiles of a
            // row are equally tall (issue #286: ragged boxes looked like a form).
            <View style={{ gap: SPACE.sm }}>
              {view.left.map((e, i) => {
                const r = view.right[i];
                return (
                  <View key={e.id} style={{ flexDirection: 'row', gap: SPACE.sm }}>
                    <View style={{ flexBasis: 0, flexGrow: pairShare(share) }}>
                      {pairTile(e.id, 'left')}
                    </View>
                    <View style={{ flexBasis: 0, flexGrow: 1 - pairShare(share) }}>
                      {r ? pairTile(r.id, 'right') : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </PartsArea>
      <BottomBar>
        <Btn
          pill
          full
          disabled={disabled || !complete}
          onPress={() =>
            onSubmit(
              { type: 'match', links: links.map((k) => ({ left: k.left, right: k.right })) },
              linksText(view, links),
            )
          }
          accessibilityHint={complete ? undefined : t('match.check_waits')}
        >
          {t('check')}
        </Btn>
      </BottomBar>
    </>
  );
}
