// "Dein Profil": where the learner learns (level), the grade for school, and
// the language. Each tap is one PATCH /learner with the profile's version
// (docs/architecture.md §API); the new language is applied only after the
// API confirmed it. A stale version reloads the profile and says so.

import type {
  LearnerView,
  MeResponse,
  UpdateLearnerRequest,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../lib/api/client.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { applyLocale } from '../../lib/i18n/index.js';
import { SUPPORTED_LOCALES } from '../../lib/i18n/resources.js';
import { Card } from '../lb/Card.js';
import { Segmented } from '../lb/Segmented.js';
import { toast } from '../lb/Toast.js';
import { GradePicker } from './GradePicker.js';
import { Group } from './Group.js';
import { Divider, Row } from './Row.js';

const LEVELS = ['school', 'university', 'adult'] as const;

export function ProfileSection({ learner }: { learner: LearnerView }) {
  const { t } = useTranslation('settings');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function patch(change: Omit<UpdateLearnerRequest, 'version'>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const version =
        queryClient.getQueryData<MeResponse>(keys.me)?.learner?.version ?? learner.version;
      const next = await updateLearner({ ...change, version });
      queryClient.setQueryData<MeResponse>(keys.me, (old) =>
        old ? { ...old, learner: next } : old,
      );
      if (change.locale) applyLocale(next.locale);
      toast.show(t('saved'));
      void queryClient.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (err instanceof ApiError && err.code === 'stale') {
        await queryClient.invalidateQueries({ queryKey: keys.me });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const level = learner.level === 'unknown' ? null : learner.level;

  return (
    <Group title={t('profile.title')}>
      <Card tone="peach" padding={20} radius={22}>
        <View style={{ gap: 18 }}>
          <Row
            question={t('profile.level_question')}
            current={level ? t(`profile.level_${level}`) : undefined}
            locked={saving}
          >
            <Segmented
              options={LEVELS.map((l) => ({ value: l, label: t(`profile.level_${l}`) }))}
              value={level}
              onChange={(next) => {
                if (next !== learner.level) void patch({ level: next });
              }}
            />
          </Row>

          {learner.level === 'school' ? (
            <>
              <Divider />
              <Row
                question={t('profile.grade_question')}
                current={
                  learner.grade !== null
                    ? t('profile.grade_value', { grade: learner.grade })
                    : undefined
                }
                hint={t('profile.grade_hint')}
              >
                <GradePicker
                  value={learner.grade}
                  disabled={saving}
                  onChange={(grade) => void patch({ grade })}
                />
              </Row>
            </>
          ) : null}

          <Divider />
          <Row
            question={t('profile.language_question')}
            current={t(`profile.language_${learner.locale}`)}
            locked={saving}
          >
            <Segmented
              options={SUPPORTED_LOCALES.map((l) => ({
                value: l,
                label: t(`profile.language_${l}`),
              }))}
              value={learner.locale}
              onChange={(locale) => {
                if (locale !== learner.locale) void patch({ locale });
              }}
            />
          </Row>
        </View>
      </Card>
    </Group>
  );
}
