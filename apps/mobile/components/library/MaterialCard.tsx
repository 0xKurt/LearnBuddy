// One photographed sheet in "Mein Stoff": its title, when it was taken and
// how many questions it gave, its reading status in words, and what can be
// done with it (practise, see its questions, read again, delete). Statuses
// are the API's; nothing is inferred.
// Looks: a white card on a soft shadow, the subject's pastel as a round mark,
// the main action first as a violet pill, quieter ones after it.

import type { MaterialView } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB, TONE_BG, TONE_DEEP, type SubjectTone } from '../../lib/theme/colors.js';
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
  onPractice: () => void;
  /** Its questions (app/material/[id].tsx). */
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
};

type Status = {
  key: 'reading' | 'unreadable' | 'not_read' | 'incomplete';
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
      // "nicht lesbar" only when that is what the reading found.
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
  onOpen,
  onRetry,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation('library');
  const title = m.title ?? t('untitled');
  const date = formatDate(m.created_at, i18n.language);
  const meta = m.status === 'ready' ? `${date} · ${t('questions', { count: m.item_count })}` : date;
  const status = statusOf(m);
  const note =
    m.status === 'failed'
      ? t(`failure.${m.failure_reason ?? 'model_error'}`)
      : m.status === 'awaiting_upload'
        ? t('incomplete_hint')
        : null;
  const retryable = m.status === 'failed' && m.failure_reason !== 'not_learning_material';

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
              backgroundColor: tone === 'paper' ? LB.canvas : TONE_BG[tone],
              borderWidth: 1,
              borderColor: tone === 'paper' ? LB.hairline : TONE_DEEP[tone],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="book" size={20} color={LB.primaryDk} />
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
        {note ? <Text style={[TYPE.body, { color: LB.ink2 }]}>{note}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {m.status === 'ready' ? (
            <Btn
              size="sm"
              pill
              disabled={disabled}
              onPress={onPractice}
              accessibilityLabel={t('practice_label', { title })}
            >
              {t('practice')}
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
          {busy ? <ActivityIndicator size="small" color={LB.primary} /> : null}
        </View>
      </View>
    </Card>
  );
}
