// The one thing that matters right now, with its single next action.

import type { NowCard as NowCardData } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { whenText } from './describe.js';

type Props = {
  card: NowCardData;
  busy: boolean;
  onResume: (sessionId: string) => void;
  onStart: (stepId: string) => void;
  onSkip: (stepId: string) => void;
  onCapture: (stepId: string | null, goalId: string | null) => void;
  onRetryMaterial: (materialId: string) => void;
};

export function NowCard({
  card,
  busy,
  onResume,
  onStart,
  onSkip,
  onCapture,
  onRetryMaterial,
}: Props) {
  const { t } = useTranslation('buddy');
  switch (card.type) {
    case 'resume_practice':
      return (
        <Card tone="primaryLt" padding={20} radius={22}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {card.mode === 'help'
              ? t('now.resume_title_help')
              : card.mode === 'explain'
                ? t('now.resume_title_explain')
                : t('now.resume_title')}
          </Text>
          <Text style={[TYPE.body, { marginTop: 4 }]}>
            {/* Sessions started from a topic or homework have no goal or step title. */}
            {card.title.trim()
              ? t('now.resume_body', { title: card.title, count: card.remaining })
              : t('now.resume_body_untitled', { count: card.remaining })}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Btn size="lg" onPress={() => onResume(card.session_id)} disabled={busy}>
              {t('now.resume_cta')}
            </Btn>
          </View>
        </Card>
      );
    case 'practice_ready':
      return (
        <Card tone="primaryLt" padding={20} radius={22}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('now.ready_title', { title: card.title })}
          </Text>
          <Text style={[TYPE.body, { marginTop: 4 }]}>
            {t('now.ready_body', { count: card.question_count, minutes: card.est_minutes })}
          </Text>
          {card.goal?.due_date ? (
            <Text style={[TYPE.small, { marginTop: 2 }]}>
              {t('now.ready_for_exam', {
                exam: card.goal.title,
                when: whenText(card.goal.due_date),
              })}
            </Text>
          ) : null}
          {card.focus_topics.length > 0 ? (
            <Text style={[TYPE.small, { marginTop: 2 }]}>
              {t('now.ready_focus', { topics: card.focus_topics.join(', ') })}
            </Text>
          ) : null}
          <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Btn size="lg" onPress={() => onStart(card.step_id)} disabled={busy}>
              {t('now.ready_cta')}
            </Btn>
            <Btn size="lg" variant="ghost" onPress={() => onSkip(card.step_id)} disabled={busy}>
              {t('now.ready_later')}
            </Btn>
          </View>
        </Card>
      );
    case 'capture_needed':
      return (
        <Card tone="peach" padding={20} radius={22}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('now.capture_title')}
          </Text>
          <Text style={[TYPE.body, { marginTop: 4 }]}>
            {t('now.capture_body', { title: card.title })}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Btn
              size="lg"
              onPress={() => onCapture(card.step_id, card.goal?.id ?? null)}
              disabled={busy}
            >
              {t('now.capture_cta')}
            </Btn>
          </View>
        </Card>
      );
    case 'material_processing':
      return (
        <Card tone="sky" padding={20} radius={22}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={LB.ink2} />
            <Text accessibilityRole="header" style={[TYPE.title, { flex: 1 }]}>
              {card.status === 'awaiting_upload'
                ? t('now.sending_title')
                : t('now.processing_title')}
            </Text>
          </View>
          <Text style={[TYPE.small, { marginTop: 8 }]}>
            {card.status === 'awaiting_upload' ? t('now.sending_body') : t('now.processing_body')}
          </Text>
        </Card>
      );
    case 'material_failed':
      return (
        <Card tone="butter" padding={20} radius={22}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('now.failed_title')}
          </Text>
          <Text style={[TYPE.body, { marginTop: 4 }]}>
            {t(`now.failed_${card.reason ?? 'model_error'}`)}
          </Text>
          <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {card.retryable ? (
              <Btn onPress={() => onRetryMaterial(card.material_id)} disabled={busy}>
                {t('now.failed_retry')}
              </Btn>
            ) : null}
            <Btn
              variant={card.retryable ? 'outline' : 'primary'}
              onPress={() => onCapture(null, null)}
              disabled={busy}
            >
              {t('now.failed_new_photo')}
            </Btn>
          </View>
        </Card>
      );
    case 'practice_result':
      return (
        <Card tone="mint" padding={20} radius={22}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('now.result_title')}
          </Text>
          <Text style={[TYPE.body, { marginTop: 4 }]}>
            {t('now.result_body', {
              answered: card.result.answered,
              first_try: card.result.first_try,
            })}
          </Text>
          {card.result.secure_topics.length > 0 ? (
            <Text style={[TYPE.small, { marginTop: 4 }]}>
              {t('now.result_secure', { topics: card.result.secure_topics.join(', ') })}
            </Text>
          ) : null}
          {card.result.shaky_topics.length > 0 ? (
            <Text style={[TYPE.small, { marginTop: 2 }]}>
              {t('now.result_shaky', { topics: card.result.shaky_topics.join(', ') })}
            </Text>
          ) : null}
        </Card>
      );
  }
}
