// The Profile page (ui_kits/app/Extra.jsx `Profile`): who she is, her subjects, and leaving.
// The Bundesland is the one fact she corrects here herself (issue #216: a right to
// rectification, no PIN) — one tap in the shared choice sheet, saved by the versioned
// controller (`useLearnerSave`). Routing and focus come from Expo.
import {
  CurriculumRegion,
  type LearnerView,
  type MeResponse,
} from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { currentSession } from '../../lib/auth/session.js';
import { SPACE } from '../../lib/theme/space.js';
import { profileSubjects } from '../buddy/extensions.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { ChoiceRow } from './ChoiceRow.js';
import { ProfileView } from './ProfileView.js';
import { useAccountActions } from './useAccountActions.js';
import { useLearnerSave } from './useLearnerSave.js';

type Props = {
  learner: LearnerView;
  account: NonNullable<MeResponse['account']>;
  active: boolean;
  pinActive?: boolean;
  onOpenSubject: (id: string) => void;
};
export function ProfilePage({ learner, account, active, pinActive = false, onOpenSubject }: Props) {
  const { t } = useTranslation('settings');
  const { t: tAuth } = useTranslation('auth');
  const { patch, saving, error } = useLearnerSave(learner, active);
  const current = useRef({ active, learner: learner.id });
  current.current = { active, learner: learner.id };
  const accountActions = useAccountActions({ account, learner, active, pinActive });

  const ProfileSubjects = profileSubjects.get();
  // The names she reads come from the locale files, never from the enum (rule 2) — the same
  // source the registration picker reads, so the two can never disagree.
  const regions = CurriculumRegion.options.map((value) => ({
    value,
    label: tAuth(`region.names.${value}`),
  }));
  return (
    <>
      {active ? (
        <View style={{ gap: SPACE.lg }}>
          <ErrorNote text={error} />
          <ProfileView
            learner={learner}
            email={learner.is_minor ? undefined : currentSession()?.email}
            subjects={
              ProfileSubjects ? (
                <ProfileSubjects
                  onOpenSubject={(id) => {
                    if (current.current.active && current.current.learner === learner.id)
                      onOpenSubject(id);
                  }}
                />
              ) : null
            }
            footer={
              <ListGroup>
                <Row
                  title={t('adult.signout.cta')}
                  icon="undo"
                  chevron={false}
                  disabled={accountActions.busy !== null}
                  onPress={() => void accountActions.askSignOut()}
                />
                {!account.deletion_running ? (
                  <Row
                    title={t(
                      account.deletion_due_at ? 'adult.delete.cancel' : 'adult.delete.title',
                    )}
                    icon="trash"
                    destructive
                    chevron={false}
                    disabled={accountActions.busy !== null}
                    onPress={() =>
                      void (account.deletion_due_at
                        ? accountActions.cancelScheduledDeletion()
                        : accountActions.askDeletion())
                    }
                  />
                ) : null}
              </ListGroup>
            }
          >
            <ChoiceRow
              title={tAuth('region.label')}
              icon="calendar"
              value={
                learner.curriculum_region
                  ? tAuth(`region.names.${learner.curriculum_region}`)
                  : tAuth('region.choose')
              }
              question={tAuth('region.title_child')}
              body={tAuth('region.why_child')}
              options={regions}
              selected={learner.curriculum_region}
              disabled={saving}
              active={active}
              onChange={(curriculum_region) => void patch({ curriculum_region })}
            />
          </ProfileView>
        </View>
      ) : null}
      {accountActions.confirmations}
    </>
  );
}
