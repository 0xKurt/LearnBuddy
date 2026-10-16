// What matters now on Buddy's home lies on top, over the greeting and the ways to start: at most
// one slim bar (≤ ~64 pt, issue #17) and the system's own notes. It never pushes anything down,
// and she can close it (only on this phone, components/buddy/TopOverlay.tsx). The slim bar is a
// domain's (`homeBar`, issue #107: the learning domain's components/learn/HomeBar.tsx); the
// layout says when it stands (lib/homeLayout.ts `homeTop`).

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { HomeAct } from '../../lib/buddy/useHomeAct.js';
import type { HomeLayout } from '../../lib/homeLayout.js';
import { slot } from '../../lib/registry.js';
import { SPACE } from '../../lib/theme/space.js';
import { Banner } from '../lb/Banner.js';
import { CLOSE_INSET, TopOverlay } from './TopOverlay.js';

type Props = {
  h: BuddyHome;
  layout: HomeLayout;
  /** The key of what lies on top, unless she closed it on this phone (lib/homeLayout.ts topKey). */
  openCard: string | null;
  busy: boolean;
  act: HomeAct;
  /** "Kein Foto nötig": the receipt of the photo ask the capture bar carries (issue #94). */
  captureUndo: MessageView['actions'][number] | null;
  onClose: (key: string) => void;
  /** How tall it is; it is drawn over the conversation (issue #190). Must be stable. */
  onHeight: (height: number) => void;
};

/** What the slim bar is drawn from; `titleInset` keeps its title clear of the close button. */
export type BarProps = Omit<Props, 'openCard' | 'onClose' | 'onHeight'> & { titleInset: number };

export const homeBar = slot<ComponentType<BarProps>>('Leiste oben (Karte)');

export function HomeTop({ openCard, onClose, onHeight, ...bar }: Props) {
  const { t } = useTranslation('buddy');
  if (!openCard) return null;
  const { system } = bar.h;
  const notes = [
    !system.model ? (
      <Banner key="model" tone="warning">
        {t('buddy:system.no_model')}
      </Banner>
    ) : null,
    system.scheduler === 'stale' ? (
      <Banner key="scheduler" tone="warning">
        {t('buddy:system.scheduler_stale')}
      </Banner>
    ) : null,
  ].filter((node) => node !== null);
  // The one slim bar the layout puts on top, or none.
  const Bar = homeBar.get();
  const slim =
    Bar && bar.layout.bar !== null ? <Bar key="now" {...bar} titleInset={CLOSE_INSET} /> : null;
  // The slim bar first (the close button sits in its corner), then what the system says. Only
  // system notes: the first one leaves room for the close button.
  const top = slim
    ? [slim, ...notes]
    : notes.map((n, i) =>
        i === 0 ? (
          <View key={`inset-${n.key ?? i}`} style={{ paddingRight: CLOSE_INSET + SPACE.lg }}>
            {n}
          </View>
        ) : (
          n
        ),
      );
  if (top.length === 0) return null;
  return (
    <TopOverlay
      id={openCard}
      closeLabel={t('buddy:card.close')}
      onClose={() => onClose(openCard)}
      onHeight={onHeight}
    >
      {top}
    </TopOverlay>
  );
}
