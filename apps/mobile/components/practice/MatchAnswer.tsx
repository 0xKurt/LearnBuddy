// Zuordnen (issue #229). Paare: offen zwei Spalten, links antippen, dann rechts (oder andersherum
// — niemand muss eine Richtung lernen). Ein gebildetes Paar rückt zu EINER Zeile zusammen,
// „links → rechts", in einer ruhigen Farbe für alle Paare (issue #524, Owner 10.10.: keine
// Zeichen ● ▲ ■ ◆, kein Farbcode, den man lernen müsste — die Zuordnung steht als Text da, auch
// für den Screenreader). Gruppen: oben, was noch einzusortieren ist, darunter je Gruppe eine
// Zeile mit ihrem Namen; ein Ding antippen, dann seine Gruppe — und es wandert IN deren Zeile,
// neben den Namen. Die Zeile ist der Zustand: keine Nummer, die sie einer Legende zuordnen
// müsste (die Darstellung stammt aus dem ersetzten `parts`-Brett, #224). Ein Tipp auf etwas
// Zugeordnetes löst es wieder: rückgängig statt bestätigen (docs/UX-PRINCIPLES.md). Sind alle
// zugeordnet, schickt „Prüfen" die Verbindungen als `parts`; geprüft wird auf dem Server, exakt
// und ohne Modell (apps/api/src/modules/practice/structured.ts).
//
// Platz (Regel 16, 360×740): eine Kachel wächst mit ihrem Text (#524: der Deckel auf zwei Zeilen
// ließ längere Aussagen gar nicht zu); der Text bricht an Wortgrenzen um, nie mitten im Wort
// (kein Wort ist länger als MATCH_WORD_MAX). Wie viel hier höchstens steht, ist gemessen: die
// MATCH_*-Grenzen in contracts/structured.ts passen ohne Scrollen auf 360×740.
//
// Mehr gibt es nicht — eine Zeile Anleitung bis zum ersten Tipp, die Elemente, „Prüfen"
// (Minimalismus, Owner 02.10.). Auch was sie gerade hält, steht im Entwurf: ein Themenwechsel
// baut den Baum neu auf (ThemeProvider).

import type { MatchTaskView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import { AnswerShell } from './AnswerShell.js';
import { PartsArea } from './PartsArea.js';
import type { FormProps } from './formProps.js';

/** One link she made: an element on the left, and its partner or group. */
export type Link = { left: string; right: string };

/** What she is holding (tapped, not yet linked), and what she has linked. */
export type MatchState = { links: Link[]; held: string | null };

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
    return { links: [...state.links, { left: id, right: state.held! }], held: null };
  }
  if (!isLeft && heldLeft) {
    return { links: [...state.links, { left: state.held!, right: id }], held: null };
  }
  if (!isLeft && groups) return state;
  return { ...state, held: id };
}

/**
 * Her links and what she holds, as kept in the draft (JSON). Both are kept: a theme change
 * remounts the tree (ThemeProvider), and a tap she already made must not be lost to it.
 * Anything that is not part of this task is left out: an unknown id, a left element twice, a
 * partner twice (pairs), a held element that is linked or a group. A pair number an older draft
 * kept (before #524) is simply not read.
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
    const { left: l, right: r } = x as Record<string, unknown>;
    if (typeof l !== 'string' || typeof r !== 'string') continue;
    if (!left.has(l) || !right.has(r) || out.some((k) => k.left === l)) continue;
    if (view.form === 'pairs' && out.some((k) => k.right === r)) continue;
    out.push({ left: l, right: r });
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
 * The words on an element: a caption's size on a tighter line, so a tile of a few words stays
 * one touch target tall. token-exempt: 14/18, between TYPE.small and TYPE.body.
 */
const ELEMENT_TEXT = { fontSize: 14, lineHeight: 18 } as const;

/** "Prüfen": everything linked; `shown` is her links in words, for the thread. */
export function MatchAnswer({ view, draftKey, disabled, onSubmit }: FormProps<MatchTaskView>) {
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
  /** What is not linked yet: a grouping's things above the groups, a pairing's open columns. */
  const open = (side: readonly { id: string }[], end: 'left' | 'right') =>
    side.filter((e) => !links.some((k) => k[end] === e.id));
  const openLeft = open(view.left, 'left');
  const openRight = open(view.right, 'right');
  /** What a tap on an element that is not linked does, in words. */
  const freeHint = (id: string, side: 'left' | 'right') =>
    held === id
      ? t('match.hint_held')
      : held !== null && (side === 'left') !== heldIsLeft
        ? t('match.hint_link', { other: spoken(held) })
        : t('match.hint_take');

  const tap = (id: string) =>
    keep((now) => JSON.stringify(tapMatch(view, stateFrom(now, view), id)));

  /** A thing to sort, above the groups or in its group's row: its state in words. */
  const element = (id: string) => {
    const group = links.find((k) => k.left === id)?.right ?? null;
    const isHeld = held === id;
    const me = spoken(id);
    return (
      <View key={id} style={{ maxWidth: '100%' }}>
        <Btn
          variant={isHeld ? 'primary' : group ? 'soft' : 'outline'}
          size="sm"
          compact
          disabled={disabled}
          onPress={() => tap(id)}
          accessibilityLabel={
            isHeld
              ? t('match.held', { text: me })
              : group
                ? t('match.in_group', { text: me, group: spoken(group) })
                : t('match.no_group', { text: me })
          }
          accessibilityHint={group ? t('match.hint_linked') : freeHint(id, 'left')}
          label={
            <MathText
              text={text.get(id) ?? ''}
              accessible={false}
              style={{
                paddingVertical: SPACE.xs,
                textAlign: 'center',
                color: isHeld ? palette.paper : group ? palette.primaryDk : palette.ink,
                ...ELEMENT_TEXT,
                fontWeight: '600',
              }}
            />
          }
        >
          {me}
        </Btn>
      </View>
    );
  };

  /** Words on a pairing's tile, wrapping at word boundaries as far as they need. */
  const tileText = (words: string, color: string) => (
    <MathText
      text={words}
      accessible={false}
      style={{ flex: 1, paddingVertical: SPACE.xs, color, ...ELEMENT_TEXT, fontWeight: '600' }}
    />
  );

  /** An open tile of a pairing: calm lilac, filled while she holds it. */
  const openTile = (id: string, side: 'left' | 'right') => {
    const isHeld = held === id;
    const me = spoken(id);
    return (
      <Btn
        key={id}
        variant={isHeld ? 'primary' : 'soft'}
        size="sm"
        full
        grow
        compact
        disabled={disabled}
        onPress={() => tap(id)}
        accessibilityLabel={
          isHeld ? t('match.held', { text: me }) : t('match.no_partner', { text: me })
        }
        accessibilityHint={freeHint(id, side)}
        label={tileText(text.get(id) ?? '', isHeld ? palette.paper : palette.primaryDk)}
      >
        {me}
      </Btn>
    );
  };

  /**
   * A formed pair (issue #524): one row across the board, "links → rechts", in the one calm
   * outline every pair shares. The text says what goes with what — no colour, no symbol to
   * look up. It runs as ONE line of text over the whole width, so a term and a sentence of up
   * to MATCH_ELEMENT_MAX take two lines, not the four a half-width column would need. A tap
   * dissolves it, and both tiles are back in their columns.
   */
  const pairRow = (link: Link) => {
    const left = spoken(link.left);
    const right = spoken(link.right);
    return (
      <Btn
        key={link.left}
        variant="outline"
        size="sm"
        full
        compact
        disabled={disabled}
        onPress={() => tap(link.left)}
        accessibilityLabel={t('match.paired', { left, right })}
        accessibilityHint={t('match.hint_linked')}
        label={tileText(
          `${text.get(link.left) ?? ''} → ${text.get(link.right) ?? ''}`,
          palette.ink,
        )}
      >
        {`${left} – ${right}`}
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
          borderRadius: RADIUS.frame,
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
                ...ELEMENT_TEXT,
                fontWeight: '700',
              }}
            />
          }
        >
          {name}
        </Btn>
        {members.map((e) => element(e.id))}
      </View>
    );
  };

  /** The formed pairs, in the order of the left column she started from. */
  const pairs = view.left.flatMap((e) => links.filter((k) => k.left === e.id));

  return (
    <AnswerShell
      answer={
        // A pairing of sentences is a list she goes through (issue #524): it may scroll.
        <PartsArea list={!groups}>
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
                {openLeft.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
                    {openLeft.map((e) => element(e.id))}
                  </View>
                ) : null}
                <View style={{ gap: SPACE.xs }}>{view.right.map((g) => group(g.id))}</View>
              </>
            ) : (
              // Pairs: the formed ones as rows on top, then what is still open in two equal
              // columns whose two tiles of a row are equally tall (issue #286: ragged boxes
              // looked like a form). Every pair takes one tile from each column, so the two
              // stay the same length.
              <View style={{ gap: SPACE.sm }}>
                {pairs.map(pairRow)}
                {openLeft.map((e, i) => {
                  const r = openRight[i];
                  return (
                    <View key={e.id} style={{ flexDirection: 'row', gap: SPACE.sm }}>
                      <View style={{ flex: 1 }}>{openTile(e.id, 'left')}</View>
                      <View style={{ flex: 1 }}>{r ? openTile(r.id, 'right') : null}</View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </PartsArea>
      }
      action={{
        ready: complete,
        disabled,
        onPress: () =>
          onSubmit(
            { type: 'match', links: links.map((k) => ({ left: k.left, right: k.right })) },
            linksText(view, links),
          ),
        waitsHint: t('match.check_waits'),
      }}
    />
  );
}
