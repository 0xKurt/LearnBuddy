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
// Mehr gibt es nicht — die Elemente, darunter eine Zeile Anleitung bis zum ersten Tipp, „Prüfen"
// (Minimalismus, Owner 02.10.). Auch was sie gerade hält, steht im Entwurf: ein Themenwechsel
// baut den Baum neu auf (ThemeProvider).
//
// Aussehen (#599, Design components/practice/Tasks.jsx): jedes Stück ist die eine Brett-Kachel
// (`components/lb/Tile.tsx`) — frei Papier, gehalten hell-violett mit Ring, zugeordnet
// hell-violett ohne Ring, die Schrift immer Tinte. Eine Gruppe ist eine Papierkarte mit ihrem
// Namen als Text; leer zeigt sie den gestrichelten Platz „leer", und solange sie etwas hält, trägt
// jede Karte den gestrichelten Ring. Die ganze Karte nimmt an — die Dinge darin liegen DARÜBER,
// nicht darin: ein Knopf in einem Knopf ist im Web ungültig (axe: nested-interactive).
// Nicht übernommen, weil es dem Vertrag bzw. einer Owner-Entscheidung widerspricht (im PR
// berichtet): die Paare mit Nummern in zwei festen Spalten (Owner 10.10., #524: EINE Zeile je
// Paar) und die Maße der Gruppenkarte (Innenabstand 10/12, Schrift 16) — die MATCH_*-Grenzen sind
// mit den Maßen hier vermessen.

import type { MatchTaskView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { speakMathText } from '../../lib/math/speak.js';
import { BOARD, WORD_ROW } from '../../lib/theme/board.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { BoardHint } from '../lb/BoardHint.js';
import { Card } from '../lb/Card.js';
import { PressArea } from '../lb/PressArea.js';
import { Tile } from '../lb/Tile.js';
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

  /** A thing to sort, above the groups or in its group's card: a word pill, its state in words. */
  const element = (id: string) => {
    const group = links.find((k) => k.left === id)?.right ?? null;
    const isHeld = held === id;
    const me = spoken(id);
    return (
      <Tile
        key={id}
        shape="word"
        state={isHeld ? 'picked' : group ? 'placed' : 'tile'}
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
        label={(color) => (
          <MathText
            text={text.get(id) ?? ''}
            accessible={false}
            style={{ textAlign: 'center', ...TYPE.boardCompact, color }}
          />
        )}
      >
        {me}
      </Tile>
    );
  };

  /** Words on a pairing's tile, wrapping at word boundaries as far as they need. */
  const tileText = (words: string) => (color: string) => (
    <MathText text={words} accessible={false} style={{ ...TYPE.boardCompact, color }} />
  );

  /** An open tile of a pairing: paper, the selected frame while she holds it. */
  const openTile = (id: string, side: 'left' | 'right') => {
    const isHeld = held === id;
    const me = spoken(id);
    return (
      <Tile
        key={id}
        state={isHeld ? 'picked' : 'tile'}
        tall
        grow
        disabled={disabled}
        onPress={() => tap(id)}
        accessibilityLabel={
          isHeld ? t('match.held', { text: me }) : t('match.no_partner', { text: me })
        }
        accessibilityHint={freeHint(id, side)}
        label={tileText(text.get(id) ?? '')}
      >
        {me}
      </Tile>
    );
  };

  /**
   * A formed pair (issue #524): one row across the board, "links → rechts", in the one placed
   * look every pair shares. The text says what goes with what — no colour, no symbol to look up.
   * It runs as ONE line of text over the whole width, so a term and a sentence of up to
   * MATCH_ELEMENT_MAX take two lines, not the four a half-width column would need. A tap
   * dissolves it, and both tiles are back in their columns.
   */
  const pairRow = (link: Link) => {
    const left = spoken(link.left);
    const right = spoken(link.right);
    return (
      <Tile
        key={link.left}
        state="placed"
        disabled={disabled}
        onPress={() => tap(link.left)}
        accessibilityLabel={t('match.paired', { left, right })}
        accessibilityHint={t('match.hint_linked')}
        label={tileText(`${text.get(link.left) ?? ''} → ${text.get(link.right) ?? ''}`)}
      >
        {`${left} – ${right}`}
      </Tile>
    );
  };

  /**
   * A group: one card, its name first and then what she has put in it. The card IS the state —
   * no number to look up. The whole card takes what she holds (a target laid under its content);
   * an element in it goes back out with a tap. Empty, it shows the dashed place "leer"; while she
   * holds something, the dashed ring says it can take it (Tasks.jsx `Groups`).
   */
  const group = (id: string) => {
    const name = spoken(id);
    const members = view.left.filter((e) => links.some((k) => k.left === e.id && k.right === id));
    const takes = heldIsLeft && !disabled;
    return (
      <View key={id} testID={`match-group-${id}`}>
        <Card
          padding={SPACE.xs}
          joined
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BOARD.gap }}
        >
          <PressArea
            // A group only receives: without something held there is nothing to put in it.
            disabled={disabled || !heldIsLeft}
            onPress={() => tap(id)}
            accessibilityRole="button"
            accessibilityLabel={t('match.group', { group: name, count: members.length })}
            accessibilityHint={
              heldIsLeft
                ? t('match.hint_put', { text: spoken(held!) })
                : t('match.hint_group_waits')
            }
            accessibilityState={{ disabled: disabled || !heldIsLeft }}
            style={FILL}
          >
            {/* The ring is drawn over the card, so it never moves what stands in it. */}
            <View
              style={{
                ...FILL,
                borderRadius: RADIUS.lg,
                borderWidth: BOARD.group.ring,
                borderStyle: 'dashed',
                borderColor: takes ? palette.primary : 'transparent',
              }}
            />
          </PressArea>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              minHeight: BOARD.word.height,
              justifyContent: 'center',
              paddingLeft: SPACE.sm,
            }}
          >
            <MathText
              text={text.get(id) ?? ''}
              accessible={false}
              style={{ ...TYPE.boardLabel, color: palette.ink }}
            />
          </View>
          {members.length === 0 ? (
            <View pointerEvents="none">
              <Tile shape="word" state="slot">
                {t('match.empty')}
              </Tile>
            </View>
          ) : (
            members.map((e) => element(e.id))
          )}
        </Card>
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
          <View style={{ gap: BOARD.gap }}>
            {groups ? (
              <>
                {/* What is still to be sorted; it empties as she sorts, and then it is gone. */}
                {openLeft.length > 0 ? (
                  <View style={WORD_ROW}>{openLeft.map((e) => element(e.id))}</View>
                ) : null}
                <View style={{ gap: SPACE.xs }}>{view.right.map((g) => group(g.id))}</View>
              </>
            ) : (
              // Pairs: the formed ones as rows on top, then what is still open in two equal
              // columns whose two tiles of a row are equally tall (issue #286: ragged boxes
              // looked like a form). Every pair takes one tile from each column, so the two
              // stay the same length.
              <View style={{ gap: BOARD.gap }}>
                {pairs.map(pairRow)}
                {openLeft.map((e, i) => {
                  const r = openRight[i];
                  return (
                    <View key={e.id} style={{ flexDirection: 'row', gap: BOARD.gap }}>
                      <View style={{ flex: 1 }}>{openTile(e.id, 'left')}</View>
                      <View style={{ flex: 1 }}>{r ? openTile(r.id, 'right') : null}</View>
                    </View>
                  );
                })}
              </View>
            )}
            {/* The one line of instruction, only until she has started — under the board. */}
            {started ? null : (
              <BoardHint>{t(groups ? 'match.how_groups' : 'match.how_pairs')}</BoardHint>
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

const FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
