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
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { SHEET_SWAP_MS } from '../buddy/StartSheets.js';
import { Text } from 'react-native';
import { TYPE } from '../../lib/theme/type.js';
import { ErrorNote } from '../lb/ErrorNote.js';
import { ChoiceOptions } from '../lb/ChoiceOptions.js';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../lib/api/client.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { applyLocale } from '../../lib/i18n/index.js';
import { SUPPORTED_LOCALES } from '../../lib/i18n/resources.js';
import { toast } from '../lb/Toast.js';
import { ListGroup, Row as ListRow } from '../lb/ListGroup.js';
import { Sheet } from '../lb/Sheet.js';
import { ProfileView } from './ProfileView.js';
import { profileSubjects } from '../buddy/extensions.js';
import { useFolds } from './folds.js';
import { useMounted } from '../../lib/useMounted.js';

export function ProfileSection({ learner }: { learner: LearnerView }) {
  const mounted = useMounted();
  const { t } = useTranslation('settings');
  // The names she reads come from the locale files, never from the enum (rule 2) — the same
  // source the registration picker reads, so the two can never disagree.
  const { t: tAuth } = useTranslation('auth');
  const regions = CurriculumRegion.options.map((value) => ({
    value,
    label: tAuth(`region.names.${value}`),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<'language' | 'region' | null>(null);
  const currentLearner = useRef(learner.id);
  currentLearner.current = learner.id;
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setError(null);
    setEditor(null);
    return () => {
      if (handoff.current !== null) clearTimeout(handoff.current);
      handoff.current = null;
    };
  }, [learner.id]);
  const openKey = useFolds((folds) => folds.open);
  const toggle = useFolds((folds) => folds.toggle);
  const open = openKey === 'language' || openKey === 'region';
  const inFlight = useRef(false);
  const feedback = useRef({ owner: learner.id, openKey, editor, epoch: 0 });
  if (
    feedback.current.owner !== learner.id ||
    feedback.current.openKey !== openKey ||
    feedback.current.editor !== editor
  ) {
    feedback.current = { owner: learner.id, openKey, editor, epoch: feedback.current.epoch + 1 };
  }

  function closeProfile() {
    const key = useFolds.getState().open;
    if (key === 'language' || key === 'region') toggle(key);
  }

  function openSubject(id: string) {
    if (currentLearner.current !== learner.id) return;
    if (handoff.current !== null) {
      closeProfile();
      return;
    }
    closeProfile();
    const owner = learner.id;
    const timer = setTimeout(() => {
      if (handoff.current !== timer) return;
      handoff.current = null;
      if (currentLearner.current === owner) {
        router.push({ pathname: '/subject/[id]', params: { id } });
      }
    }, SHEET_SWAP_MS);
    handoff.current = timer;
  }

  async function patch(change: Omit<UpdateLearnerRequest, 'version'>) {
    if (inFlight.current) return;
    const owner = learner.id;
    const cached = queryClient.getQueryData<MeResponse>(keys.me)?.learner;
    if (cached?.id !== owner) return;
    inFlight.current = true;
    const epoch = feedback.current.epoch;
    const currentFeedback = () =>
      mounted.current && currentLearner.current === owner && feedback.current.epoch === epoch;
    setError(null);
    setSaving(true);
    try {
      const next = await updateLearner({ ...change, version: cached.version });
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
    } catch (err) {
      if (currentFeedback()) setError(messageFor(err));
      if (err instanceof ApiError && err.code === 'stale') {
        await queryClient.invalidateQueries({ queryKey: keys.me });
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  const ProfileSubjects = profileSubjects.get();
  return (
    <>
      <ListGroup>
        <ListRow
          title={t('profile.title')}
          value={learner.display_name}
          onPress={() => {
            setError(null);
            setEditor(null);
            toggle('language');
          }}
        />
      </ListGroup>
      <Sheet
        visible={open}
        title={
          editor === 'language'
            ? t('profile.language_title')
            : editor === 'region'
              ? tAuth('region.title_child')
              : t('profile.title')
        }
        scrollTestID={editor === 'region' ? 'scroll-list' : undefined}
        onClose={() => {
          if (editor) {
            setError(null);
            setEditor(null);
          } else closeProfile();
        }}
        closeLabel={editor ? t('common:a11y.back') : t('common:actions.close')}
      >
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
          <ProfileView learner={learner}>
            <ListGroup>
              <ListRow
                title={t('profile.language_title')}
                value={t(`profile.language_${learner.locale}`)}
                onPress={() => setEditor('language')}
              />
              <ListRow
                title={tAuth('region.label')}
                value={
                  learner.curriculum_region
                    ? tAuth(`region.names.${learner.curriculum_region}`)
                    : tAuth('region.choose')
                }
                onPress={() => setEditor('region')}
              />
            </ListGroup>
            {open && ProfileSubjects ? <ProfileSubjects onOpenSubject={openSubject} /> : null}
          </ProfileView>
        )}
      </Sheet>
    </>
  );
}
