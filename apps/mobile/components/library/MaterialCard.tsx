// One photographed sheet in a subject of "Dein Material": its title, when it was taken and
// how many questions it gave, its reading status in words, and what can be
// done with it (practise, see its questions, read again, delete). Statuses
// are the API's; nothing is inferred.
// Looks: a white card on a soft shadow, the subject's pastel as a round mark,
// the main action first as a violet pill, quieter ones after it.

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SubjectTone } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDate } from '../../lib/time.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Chip } from '../lb/Chip.js';
import { Icon } from '../lb/Icon.js';

type Props = {
  material: MaterialView;
  tone: SubjectTone | 'paper';
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

type Status = {
  key: 'reading' | 'unreadable' | 'not_read' | 'incomplete' | 'no_exercises';
  tone: 'gray' | 'primary' | 'warning';
};

function statusOf(m: MaterialView): Status | null {
  switch (m.status) {
    case 'ready':
      return null;
    case 'queued':
    case 'processing':
      return { key: 'reading', tone: 'primary' };
    case 'awaiting_upload':
      return { key: 'incomplete', tone: 'gray' };
    case 'failed':
      // "nicht lesbar" only when that is what the reading found — and a sheet whose tasks
      // are exercise forms Buddy cannot practise WAS read (issue #198), so it never says
      // "nicht gelesen": it has no exercises, and that is not a warning about her photo.
      if (m.failure_reason === 'form_not_practicable') return { key: 'no_exercises', tone: 'gray' };
      return {
        key: m.failure_reason === 'unreadable' ? 'unreadable' : 'not_read',
        tone: 'warning',
      };
  }
}

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
  const { palette, tones } = useTheme();
  const { t, i18n } = useTranslation('library');
  const title = m.title ?? t('untitled');
  const date = formatDate(m.created_at, i18n.language);
  const meta = m.status === 'ready' ? `${date} · ${t('questions', { count: m.item_count })}` : date;
  const status = statusOf(m);
  // The photos are gone (7 days after reading): reading again is not possible, only a new photo.
  const note =
    m.status === 'failed' &&
    m.photos_deleted &&
    m.failure_reason !== 'not_learning_material' &&
    m.failure_reason !== 'blocked'
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
  const speakable = m.purpose !== 'homework' && m.speak_count > 0;
  // A sheet whose questions are ALL sentences to read aloud has nothing to practise in
  // writing: there "Üben" would lead to "hier gibt es gerade nichts zu üben", so reading
  // aloud IS its main action.
  const spokenOnly = speakable && m.speak_count >= m.item_count;
  // A homework sheet leads back to its help session, never to drill practice (audit H-7).
  const action =
    m.purpose !== 'homework'
      ? spokenOnly
        ? 'speak'
        : 'practice'
      : m.session_status === 'finished'
        ? 'homework_view'
        : 'homework_continue';
  const retryable =
    m.status === 'failed' &&
    m.failure_reason !== 'not_learning_material' &&
    m.failure_reason !== 'blocked' &&
    // Reading it again would find the same tasks; the API refuses it (issue #198).
    m.failure_reason !== 'form_not_practicable' &&
    !m.photos_deleted;

  return (
    <Card padding={16}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: tone === 'paper' ? palette.canvas : tones.bg[tone],
              borderWidth: 1,
              borderColor: tone === 'paper' ? palette.hairline : tones.deep[tone],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="book" size={20} color={palette.primaryDk} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[TYPE.body, { fontWeight: '600' }]}>{title}</Text>
            <Text style={TYPE.small}>{meta}</Text>
            {status ? (
              <View style={{ marginTop: 2 }}>
                <Chip tone={status.tone}>{t(`status.${status.key}`)}</Chip>
              </View>
            ) : null}
          </View>
        </View>
        {note ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{note}</Text> : null}
        {missed ? <Text style={[TYPE.body, { color: palette.ink2 }]}>{missed}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
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
          {busy ? <ActivityIndicator size="small" color={palette.primary} /> : null}
        </View>
      </View>
    </Card>
  );
}
