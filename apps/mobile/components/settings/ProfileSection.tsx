// The app language, and the Bundesland her school is in. Level and grade are not a form: Buddy
// learns them in the conversation (set_level) or at sign-up. Each tap is one PATCH /learner with the profile's version
// (docs/architecture.md §API); the new language is applied only after the
// API confirmed it. A stale version reloads the profile and says so.

import {
  CurriculumRegion,
  type LearnerView,
  type MeResponse,
  type UpdateLearnerRequest,
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
import { PickerField } from '../lb/PickerField.js';
import { Segmented } from '../lb/Segmented.js';
import { toast } from '../lb/Toast.js';
import { Group } from './Group.js';
import { Row } from './Row.js';

export function ProfileSection({ learner }: { learner: LearnerView }) {
  const { t } = useTranslation('settings');
  // The names she reads come from the locale files, never from the enum (rule 2) — the same
  // source the registration picker reads, so the two can never disagree.
  const { t: tAuth } = useTranslation('auth');
  const regions = CurriculumRegion.options.map((value) => ({
    value,
    label: tAuth(`region.names.${value}`),
  }));
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

  const language = (
    <Group
      title={t('profile.language_title')}
      fold="language"
      summary={t(`profile.language_${learner.locale}`)}
    >
      <Card padding={20}>
        <View style={{ gap: 18 }}>
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

  // The Bundesland was settable at registration and nowhere else (issue #216): a typo, or a
  // move to another state, could only be corrected in the database. That is a right to
  // rectification, not a convenience (docs/privacy.md). No PIN: a wrong value here harms
  // nobody, and a hurdle would prevent exactly the correction this exists for.
  const region = (
    <Group
      title={tAuth('region.label')}
      fold="region"
      summary={learner.curriculum_region ? tAuth(`region.names.${learner.curriculum_region}`) : ''}
    >
      <Card padding={20}>
        <PickerField
          label={tAuth('region.label')}
          placeholder={tAuth('region.choose')}
          title={tAuth('region.title_child')}
          body={tAuth('region.why_child')}
          options={regions}
          value={learner.curriculum_region}
          disabled={saving}
          onChange={(curriculum_region) => {
            if (curriculum_region !== learner.curriculum_region) void patch({ curriculum_region });
          }}
        />
      </Card>
    </Group>
  );

  return (
    <>
      {language}
      {region}
    </>
  );
}
