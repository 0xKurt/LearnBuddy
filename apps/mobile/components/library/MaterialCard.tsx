// One photographed sheet in a subject of "Dein Material": its title, when it was taken and
// how many questions it gave, its reading status in words, and what can be
// done with it (practise, see its questions, read again, delete). Statuses
// are the API's; nothing is inferred.
// Looks: a white card on a soft shadow, the subject's pastel as a round mark,
// the main action first as a violet pill, quieter ones after it.

import {
  FINAL_FAILURES,
  PHOTOS_GONE_AT_ONCE,
  type MaterialView,
} from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { BusyIndicator } from '../lb/BusyIndicator.js';
import { useTranslation } from 'react-i18next';

import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { LIBRARY } from '../../lib/theme/library.js';
import { TYPE } from '../../lib/theme/type.js';
import { materialStatusOf, materialPrimaryOf } from './materialPresentation.js';
import { formatDate } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { IconDisc } from '../lb/IconDisc.js';
import { useMarkTint, type CardTone } from './tone.js';

type Props = {
  material: MaterialView;
  tone: CardTone;
  /** This card's action is running. */
  busy: boolean;
  /** Some action is running; no second one meanwhile. */
  disabled: boolean;
  /** Practise it; a homework sheet opens its help session (the server finds it). */
  onPractice: () => void;
  /** Read the sentences on this sheet aloud (only shown when it has some, issue #223). */
  onSpeak: () => void;
  /** Its questions (app/material/[id].tsx). */
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
};

export function MaterialCard({
  material: m,
  tone,
  busy,
  disabled,
  onPractice,
  onSpeak,
  onOpen,
  onRetry,
  onDelete,
}: Props) {
  const { palette } = useTheme();
  const tint = useMarkTint(tone);
  const { t, i18n } = useTranslation('library');
  const title = m.title ?? t('untitled');
  const date = formatDate(m.created_at, i18n.language);
  const meta = m.status === 'ready' ? `${date} · ${t('questions', { count: m.item_count })}` : date;
  const status = materialStatusOf(m);
  // The photos are gone (7 days after reading): reading again is not possible, only a new photo.
  // Where they go at once by design, the reason says more than their absence does.
  const note =
    m.status === 'failed' &&
    m.photos_deleted &&
    !(m.failure_reason && PHOTOS_GONE_AT_ONCE.has(m.failure_reason))
      ? t('photos_deleted')
      : m.status === 'failed'
        ? t(`failure.${m.failure_reason ?? 'model_error'}`)
        : m.status === 'awaiting_upload'
          ? t('incomplete_hint')
          : null;
  // Tasks on the sheet that got no exercises, because their form is not one Buddy can
  // practise (issue #198). A quiet line next to the note: unsaid, the sheet would look
  // whole while the exercise she photographed never happened.
  const missed =
    m.not_practicable.length > 0
      ? t('not_practicable', {
          count: m.not_practicable.length,
          tasks: m.not_practicable.map((n) => n.task).join(' · '),
        })
      : null;
  // Sentences on this sheet to read aloud (issue #223 point 2). They are never part of an
  // ordinary practice — the microphone has no place in the middle of typing — so the sheet
  // offers them separately, and only when it has them.
  const { action, speakable, spokenOnly } = materialPrimaryOf(m);
  // Reading it again would give the same answer: the API refuses it (FINAL_FAILURES).
  const retryable =
    m.status === 'failed' &&
    !(m.failure_reason && FINAL_FAILURES.has(m.failure_reason)) &&
    !m.photos_deleted;

  return (
    <Card padding={SPACE.lg}>
      <View style={{ gap: RHYTHM.stack }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
          <IconDisc
            name="book"
            size={LIBRARY.materialMark.size}
            iconSize={LIBRARY.materialMark.iconSize}
            tone={tint}
          />
          <View style={{ flex: 1, gap: SPACE.xs }}>
            <Text style={TYPE.cell}>{title}</Text>
            <Text style={TYPE.small}>{meta}</Text>
            {status ? (
              // Status stays attached to its metadata.
              <View style={{ marginTop: LIBRARY.statusGap }}>
                <Chip tone={status.tone}>{t(`status.${status.key}`)}</Chip>
              </View>
            ) : null}
          </View>
        </View>
        {note ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{note}</Text> : null}
        {missed ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{missed}</Text> : null}
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm }}
        >
          {m.status === 'ready' ? (
            <Btn
              size="sm"
              pill
              disabled={disabled}
              icon={action === 'speak' ? 'mic' : undefined}
              onPress={action === 'speak' ? onSpeak : onPractice}
              accessibilityLabel={t(`${action}_label`, { title })}
            >
              {t(action)}
            </Btn>
          ) : null}
          {m.status === 'ready' && speakable && !spokenOnly ? (
            <Btn
              size="sm"
              variant="soft"
              pill
              icon="mic"
              disabled={disabled}
              onPress={onSpeak}
              accessibilityLabel={t('speak_label', { title })}
            >
              {t('speak')}
            </Btn>
          ) : null}
          {m.status === 'ready' ? (
            <Btn
              size="sm"
              variant="soft"
              pill
              disabled={disabled}
              onPress={onOpen}
              accessibilityLabel={t('open_label', { title })}
            >
              {t('open')}
            </Btn>
          ) : null}
          {retryable ? (
            <Btn
              size="sm"
              pill
              disabled={disabled}
              onPress={onRetry}
              accessibilityLabel={t('retry_label', { title })}
            >
              {t('retry')}
            </Btn>
          ) : null}
          <Btn
            size="sm"
            variant="ghost"
            pill
            disabled={disabled}
            onPress={onDelete}
            accessibilityLabel={t('delete_label', { title })}
          >
            {t('delete')}
          </Btn>
          {busy ? <BusyIndicator size="small" color={palette.primary} /> : null}
        </View>
      </View>
    </Card>
  );
}
