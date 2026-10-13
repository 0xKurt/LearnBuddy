// The one card for everything Buddy puts into the thread (#599; design
// components/practice/PracticeReady.jsx `PracticeReady` and `ChatCard`, components/buddy/Cards.jsx,
// MIGRATION §5 "eine Karte für alle Hinweise im Chat"): an offer to practise, a sheet he is
// reading or could not read, a page that is missing, a question he needs answered.
//
//   · paper on a soft shadow, radius lg, 16 inside (`CARD_PAD.thread`), the thread's whole width;
//   · a 48 pt tile — lavender for an offer, blush for what needs her, canvas for a status —
//     with a 22 pt sign, her own page, or the busy mark;
//   · a small label in the tile's ink, the title (700 17), a quiet detail;
//   · at most one primary action, full width, and a ghost beside it.
//
// A card that asks a question with several answers (Cards.jsx: `HowDidItGo`, `ContactOptIn`,
// `ConfirmCard`) hands them in as `children`: 44 pt pills in a wrapping row (`CardChoices`).

import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { CHAT } from '../../lib/theme/chat.js';
import type { Palette } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { CARD_PAD, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { BusyIndicator } from '../lb/BusyIndicator.js';
import { Card } from '../lb/Card.js';
import { Icon, type IconName } from '../lb/Icon.js';
import { ZoomablePhoto } from '../lb/ZoomViewer.js';

/** accent: an offer · warn: it needs her · quiet: a status (PracticeReady.jsx:23). */
type CardTone = 'accent' | 'warn' | 'quiet';

export type CardAction = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /**
   * The violet button belongs to the bar on top while one lies there (HANDOFF §4: one primary
   * per screen): then the card's own main action is the paper one.
   */
  variant?: 'primary' | 'secondary';
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type Props = {
  tone?: CardTone;
  /** The tile's sign; without one (and without a page) the card has no tile: a plain question. */
  icon?: IconName;
  /** A photo of her page in the tile, so she recognises the sheet; a tap shows it large. */
  thumb?: string | null;
  /** Buddy is on it: the busy mark stands in the tile. */
  busy?: boolean;
  label?: string | null;
  title: string;
  detail?: string | null;
  /** Lines of the title before it is cut (an offer's topic may be a sentence). */
  titleLines?: number;
  primary?: CardAction | null;
  /** The arrow of an offer's "Los geht's" (PracticeReady.jsx:17). */
  arrow?: boolean;
  secondary?: CardAction | null;
  /** A quiet line under the actions: why a start failed, or that it cannot start. */
  note?: string | null;
  /** The card's words are news: a screen reader hears them when they come. */
  live?: boolean;
  /** Answers of its own (`CardChoices`), or what settled it (`CardDone`). */
  children?: ReactNode;
};

function tileOf(tone: CardTone, p: Palette): { bg: string; ink: string } {
  if (tone === 'accent') return { bg: p.primaryLt, ink: p.primaryDk };
  if (tone === 'warn') return { bg: p.blush, ink: p.danger };
  return { bg: p.canvas, ink: p.ink2 };
}

export function ChatCard({
  tone = 'quiet',
  icon,
  thumb = null,
  busy = false,
  label = null,
  title,
  detail = null,
  titleLines,
  primary = null,
  arrow = false,
  secondary = null,
  note = null,
  live = false,
  children,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const tile = tileOf(tone, palette);
  const tiled = Boolean(icon || thumb || busy);
  return (
    <Card padding={CARD_PAD.thread} style={{ gap: tiled ? SPACE.lg : SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        {tiled ? (
          <View
            style={{
              width: CHAT.card.tile,
              height: CHAT.card.tile,
              borderRadius: RADIUS.sm,
              backgroundColor: thumb ? palette.canvas : tile.bg,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {thumb ? (
              <ZoomablePhoto uri={thumb}>
                <Image
                  source={{ uri: thumb }}
                  // Her page is a thing on the screen, so it carries a name (image-alt, #73).
                  accessible
                  accessibilityLabel={t('common:zoom.photo')}
                  style={{ width: CHAT.card.tile, height: CHAT.card.tile }}
                  contentFit="cover"
                />
              </ZoomablePhoto>
            ) : busy ? (
              <BusyIndicator size="small" color={palette.primary} />
            ) : icon ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Icon name={icon} size={CHAT.card.glyph} color={tile.ink} />
              </View>
            ) : null}
          </View>
        ) : null}
        <View
          accessible
          accessibilityLiveRegion={live ? 'polite' : undefined}
          accessibilityLabel={[label, title, detail].filter(Boolean).join(' ')}
          style={{ flex: 1, minWidth: 0, gap: CHAT.card.lineGap }}
        >
          {label ? (
            <Text style={[TYPE.label, { color: tone === 'quiet' ? palette.ink2 : tile.ink }]}>
              {label}
            </Text>
          ) : null}
          <Text style={TYPE.title} numberOfLines={titleLines}>
            {title}
          </Text>
          {detail ? <Text style={TYPE.meta}>{detail}</Text> : null}
        </View>
      </View>
      {children}
      {primary || secondary ? (
        <View style={{ flexDirection: 'row', gap: CHAT.card.actions }}>
          {primary ? (
            <View style={{ flex: 1 }}>
              <Btn
                full
                variant={primary.variant ?? 'primary'}
                iconRight={arrow && !primary.busy ? 'arrow' : undefined}
                busy={primary.busy}
                disabled={primary.disabled}
                accessibilityLabel={primary.accessibilityLabel}
                accessibilityHint={primary.accessibilityHint}
                onPress={primary.onPress}
              >
                {primary.label}
              </Btn>
            </View>
          ) : null}
          {secondary ? (
            <View style={primary ? undefined : { flex: 1 }}>
              <Btn
                variant="ghost"
                full={!primary}
                compact
                busy={secondary.busy}
                disabled={secondary.disabled}
                accessibilityLabel={secondary.accessibilityLabel}
                accessibilityHint={secondary.accessibilityHint}
                onPress={secondary.onPress}
              >
                {secondary.label}
              </Btn>
            </View>
          ) : null}
        </View>
      ) : null}
      {note ? (
        <Text accessibilityLiveRegion="polite" style={TYPE.meta}>
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

/**
 * Buddy's offer in the chat: a practice is ready. One card, one action (PracticeReady.jsx:6–20):
 * the lavender sparkle tile, what it is in the accent, its topic, and the button with the arrow.
 * `start` is null where it cannot start: then the note says why, and there is no button.
 */
export function PracticeReady({
  label,
  title,
  detail = null,
  note = null,
  start,
}: {
  label: string;
  title: string;
  detail?: string | null;
  note?: string | null;
  start: CardAction | null;
}) {
  return (
    <ChatCard
      tone="accent"
      icon="sparkle"
      label={label}
      title={title}
      titleLines={2}
      detail={detail}
      primary={start}
      arrow
      note={note}
    />
  );
}

/** A question card's answers: 44 pt pills that wrap, 8 apart (Cards.jsx:45, :61, :75). */
export function CardChoices({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>{children}</View>;
}

/** What settled a question, in the card it was asked in (Cards.jsx:43): a tick and the words. */
export function CardDone({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: CHAT.takeBack.gap }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="check" size={CHAT.takeBack.icon} color={palette.successText} />
      </View>
      <Text style={[TYPE.metaSemibold, { flexShrink: 1, color: palette.successText }]}>
        {children}
      </Text>
    </View>
  );
}
