// "Profil" in the settings (ui_kits/app/Settings.jsx:36–40): her class, the app's language and
// Buddy's voice, each with what is set now. The class is not a form — Buddy learns it in the
// conversation (set_level) or at sign-up — so its row only says it. The language is one tap in
// the shared choice sheet and one PATCH /learner (`useLearnerSave`); the new language is applied
// only after the API confirmed it. The voice has a page of its own, and no row where Buddy's own
// voices are not (`natural_voice`, issue #526).

import type { BuddySettingsView, LearnerView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LOCALES } from '../../lib/i18n/resources.js';
import { SPACE } from '../../lib/theme/space.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { ChoiceRow } from './ChoiceRow.js';
import { useLearnerSave } from './useLearnerSave.js';

type Props = {
  learner: LearnerView;
  settings: BuddySettingsView;
  /** False while the settings are not in front. */
  active: boolean;
};

export function ProfileGroup({ learner, settings, active }: Props) {
  const { t } = useTranslation(['settings', 'buddy']);
  const { patch, saving, error } = useLearnerSave(learner, active);
  return (
    <View style={{ gap: SPACE.sm }}>
      <ListGroup label={t('settings:profile.page_title')}>
        {learner.grade !== null ? (
          <Row
            title={t('settings:profile.grade_label')}
            value={t('settings:profile.grade_value', { grade: learner.grade })}
          />
        ) : null}
        <ChoiceRow
          title={t('settings:profile.language_title')}
          value={t(`settings:profile.language_${learner.locale}`)}
          options={SUPPORTED_LOCALES.map((value) => ({
            value,
            label: t(`settings:profile.language_${value}`),
          }))}
          selected={learner.locale}
          disabled={saving}
          active={active}
          onChange={(locale) => void patch({ locale })}
        />
        {settings.natural_voice ? (
          <Row
            title={t('settings:voice.title')}
            value={t(`buddy:voice_pick.name.${settings.voice}`)}
            onPress={() => router.push('/settings/voice')}
          />
        ) : null}
      </ListGroup>
      <ErrorNote text={error} />
    </View>
  );
}
