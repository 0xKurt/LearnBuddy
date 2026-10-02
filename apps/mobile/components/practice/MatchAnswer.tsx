// Zuordnen (issue #229). Paare: zwei Spalten, links antippen, dann rechts (oder andersherum
// — niemand muss eine Richtung lernen); das Paar bekommt eine gemeinsame Nummer. Gruppen:
// oben die Dinge, darunter die Gruppen; ein Ding antippen, dann seine Gruppe — es trägt dann
// deren Nummer. Ein Tipp auf etwas Zugeordnetes löst es wieder: rückgängig statt bestätigen
// (docs/UX-PRINCIPLES.md). Sind alle zugeordnet, schickt „Prüfen" die Verbindungen als
// `parts`; geprüft wird auf dem Server, exakt und ohne Modell
// (apps/api/src/modules/practice/structured.ts).
//
// Platz (Regel 16, 360×740): fünf Paare in zwei Spalten sind fünf Zeilen statt zehn. Die
// Nummer sitzt als kleine Scheibe auf der Ecke, nicht im Text — so bleibt einem langen Wort
// die ganze Breite, und die Spalten teilen sich die Breite nach ihren längsten Wörtern
// (`leftShare`). Was trotzdem nicht in eine Zeile passt, bricht um; zwei Zeilen passen in
// die 44 pt eines Elements.
//
// Die Elemente bleiben, wo sie stehen; was sich ändert, ist ihre Nummer. Farbe ist nie das
// einzige Signal: die Nummer steht auf der Ecke, und ein Screenreader hört die Zuordnung in
// Worten („…, Paar 2 mit …" bzw. „…, in Nomen"). Mehr gibt es nicht — eine Zeile Anleitung
// bis zum ersten Tipp, die Elemente, „Prüfen" (Minimalismus, Owner 02.10.). Auch was sie
// gerade hält, steht im Entwurf: ein Themenwechsel baut den Baum neu auf (ThemeProvider).

import type { MatchTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
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

/** The number of a link, a small disc on the element's corner. */
const BUBBLE = 20;

/**
 * The pair's (or group's) number on the corner of an element, outside its text: a long word
 * keeps the whole width of the element (two columns on a 360 pt phone leave little else).
 * Decorative — the element's name says the link in words.
 */
function NumberBubble({ n }: { n: number }) {
  const { palette } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        // Half on the corner, so it reads as the element's, not as a neighbour's.
        top: -SPACE.sm,
        left: -SPACE.sm,
        width: BUBBLE,
        height: BUBBLE,
        borderRadius: BUBBLE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.primary,
        borderWidth: 2,
        borderColor: palette.bg,
      }}
    >
      <Text style={{ color: palette.paper, fontSize: 11, lineHeight: 13, fontWeight: '700' }}>
        {n}
      </Text>
    </View>
  );
}

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
            <MathText
              text={text.get(id) ?? ''}
              accessible={false}
              style={{
                // Two lines still fit the 44 pt of one element.
                paddingVertical: SPACE.xs,
                // In a column every point counts: the label reaches SPACE.xs into the
                // button's compact padding (12 → 8 at each side), so a long word fits.
                ...(groups ? {} : { marginHorizontal: -SPACE.xs }),
                color: isHeld ? palette.paper : link ? palette.primaryDk : palette.ink,
                fontSize: 14,
                lineHeight: 18,
                fontWeight: '600',
              }}
            />
          }
        >
          {me}
        </Btn>
        {link ? <NumberBubble n={link.n} /> : null}
      </View>
    );
  };

  /** A group: always shows its number; takes what she holds. */
  const group = (id: string, index: number) => {
    const name = spoken(id);
    const count = links.filter((k) => k.right === id).length;
    return (
      <View key={id} style={{ maxWidth: '100%' }}>
        <Btn
          variant="soft"
          size="sm"
          compact
          // A group only receives: without something held there is nothing to put in it.
          disabled={disabled || !heldIsLeft}
          onPress={() => tap(id)}
          accessibilityLabel={t('match.group', { group: name, n: index + 1, count })}
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
        <NumberBubble n={index + 1} />
      </View>
    );
  };

  const share = leftShare(
    view.left.map((e) => e.text),
    view.right.map((e) => e.text),
  );

  return (
    <>
      <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, gap: SPACE.sm }}>
        {/* The one line of instruction, only until she has started (like an order's). */}
        {started ? null : (
          <Text style={[TYPE.small, { color: palette.ink2 }]}>
            {t(groups ? 'match.how_groups' : 'match.how_pairs')}
          </Text>
        )}
        {groups ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {view.left.map((e) => element(e.id, 'left'))}
            </View>
            {/* Where things go: a thin line is all that separates the two sides. */}
            <View style={{ height: 1, backgroundColor: palette.hairline }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {view.right.map((g, i) => group(g.id, i))}
            </View>
          </>
        ) : (
          // Pairs: two columns, so five pairs take five rows, not ten.
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <View style={{ gap: SPACE.sm, flexBasis: 0, flexGrow: share }}>
              {view.left.map((e) => element(e.id, 'left'))}
            </View>
            <View style={{ gap: SPACE.sm, flexBasis: 0, flexGrow: 1 - share }}>
              {view.right.map((e) => element(e.id, 'right'))}
            </View>
          </View>
        )}
      </View>
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
