// The Profile page keeps the real versioned save controller; routing/focus comes from Expo.
import {
  CurriculumRegion,
  type LearnerView,
  type MeResponse,
  type UpdateLearnerRequest,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api/client.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { currentSession } from '../../lib/auth/session.js';
import { messageFor } from '../../lib/errors.js';
import { applyLocale } from '../../lib/i18n/index.js';
import { SUPPORTED_LOCALES } from '../../lib/i18n/resources.js';
import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { useMounted } from '../../lib/useMounted.js';
import { profileSubjects } from '../buddy/extensions.js';
import { ChoiceOptions } from '../lb/ChoiceOptions.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { toast } from '../lb/Toast.js';
import { ProfileView } from './ProfileView.js';
import { useAccountActions } from './useAccountActions.js';

export type ProfileEditor = 'language' | 'region' | null;
type Props = {
  learner: LearnerView;
  account: NonNullable<MeResponse['account']>;
  editor: ProfileEditor;
  active: boolean;
  pinActive?: boolean;
  onEdit: (editor: Exclude<ProfileEditor, null>) => void;
  onOpenSubject: (id: string) => void;
};
export function ProfilePage({
  learner,
  account,
  editor,
  active,
  pinActive = false,
  onEdit,
  onOpenSubject,
}: Props) {
  const mounted = useMounted();
  const { t } = useTranslation('settings');
  const { t: tAuth } = useTranslation('auth');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentLearner = useRef(learner.id);
  currentLearner.current = learner.id;
  const context = useRef({ active });
  context.current = { active };
  const inFlight = useRef(false);
  const mutationKey = ['profile-learner', learner.id];
  const save = useMutation(
    {
      mutationKey,
      // The existing endpoint owns transport/error handling, including offline attempts.
      networkMode: 'always',
      mutationFn: async ({
        change,
        accept,
      }: {
        change: UpdateLearnerRequest;
        accept: (next: LearnerView) => void;
      }) => {
        const next = await updateLearner(change);
        accept(next);
        return next;
      },
    },
    queryClient,
  );
  const feedback = useRef({ owner: learner.id, active, editor, epoch: 0 });
  if (
    feedback.current.owner !== learner.id ||
    feedback.current.active !== active ||
    feedback.current.editor !== editor
  ) {
    feedback.current = { owner: learner.id, active, editor, epoch: feedback.current.epoch + 1 };
  }
  useEffect(() => {
    setError(null);
  }, [active, editor, learner.id]);
  const accountActions = useAccountActions({ account, learner, active, pinActive });
  async function patch(change: Omit<UpdateLearnerRequest, 'version'>) {
    if (!active || inFlight.current || queryClient.isMutating({ mutationKey }) > 0) return;
    const owner = learner.id;
    const query = queryClient.getQueryCache().find({ queryKey: keys.me, exact: true });
    const cached = queryClient.getQueryData<MeResponse>(keys.me)?.learner;
    if (!query || cached?.id !== owner) return;
    const currentQuery = () =>
      queryClient.getQueryCache().find({ queryKey: keys.me, exact: true }) === query &&
      queryClient.getQueryData<MeResponse>(keys.me)?.learner?.id === owner;
    inFlight.current = true;
    const epoch = feedback.current.epoch;
    const currentFeedback = () =>
      mounted.current &&
      context.current.active &&
      currentLearner.current === owner &&
      feedback.current.epoch === epoch &&
      currentQuery();
    setError(null);
    setSaving(true);
    try {
      await save.mutateAsync({
        change: { ...change, version: cached.version },
        accept: (next) => {
          if (!currentQuery()) return;
          let accepted = false;
          queryClient.setQueryData<MeResponse>(keys.me, (old) => {
            if (next.id !== owner || currentLearner.current !== owner) return old;
            if (old?.learner?.id !== owner || old.learner.version > next.version) return old;
            accepted = true;
            return { ...old, learner: next };
          });
          if (accepted) {
            if (change.locale) applyLocale(next.locale);
            if (currentFeedback()) toast.show(t('saved'));
            void queryClient.invalidateQueries({ queryKey: keys.me });
          }
        },
      });
    } catch (err) {
      if (currentFeedback()) setError(messageFor(err));
      if (err instanceof ApiError && err.code === 'stale' && currentQuery()) {
        await queryClient.invalidateQueries({ queryKey: keys.me });
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const ProfileSubjects = profileSubjects.get();
  const regions = CurriculumRegion.options.map((value) => ({
    value,
    label: tAuth(`region.names.${value}`),
  }));
  return (
    <>
      {active ? (
        <View style={{ gap: SPACE.lg }}>
          <ErrorNote text={error} />
          {editor === 'language' ? (
            <ChoiceOptions
              label={t('profile.language_title')}
              options={SUPPORTED_LOCALES.map((value) => ({
                value,
                label: t(`profile.language_${value}`),
              }))}
              value={learner.locale}
              disabled={saving}
              onChange={(locale) => {
                if (locale !== learner.locale) void patch({ locale });
              }}
            />
          ) : editor === 'region' ? (
            <>
              <Text style={TYPE.paragraph}>{tAuth('region.why_child')}</Text>
              <ChoiceOptions
                label={tAuth('region.label')}
                options={regions}
                value={learner.curriculum_region}
                disabled={saving}
                onChange={(curriculum_region) => {
                  if (curriculum_region !== learner.curriculum_region)
                    void patch({ curriculum_region });
                }}
              />
            </>
          ) : (
            <ProfileView
              learner={learner}
              email={learner.is_minor ? undefined : currentSession()?.email}
              subjects={
                ProfileSubjects ? (
                  <ProfileSubjects
                    onOpenSubject={(id) => {
                      if (context.current.active && currentLearner.current === learner.id)
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
              <Row
                title={tAuth('region.label')}
                icon="calendar"
                value={
                  learner.curriculum_region
                    ? tAuth(`region.names.${learner.curriculum_region}`)
                    : tAuth('region.choose')
                }
                onPress={() => onEdit('region')}
              />
              <Row
                title={t('profile.language_title')}
                icon="speak"
                value={t(`profile.language_${learner.locale}`)}
                onPress={() => onEdit('language')}
              />
            </ProfileView>
          )}
        </View>
      ) : null}
      {accountActions.confirmations}
    </>
  );
}
