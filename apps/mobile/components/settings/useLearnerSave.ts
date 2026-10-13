// One confirmed change to her profile (PATCH /learner with the profile's version): the language
// in the settings, the Bundesland on the Profile page. What is shown afterwards is the API's
// answer; a stale version reloads the profile. A save belongs to the learner, the cache and the
// visit it started in: an answer that arrives after she left, after the profile was replaced or
// after the cache was cleared changes nothing and says nothing.

import type {
  LearnerView,
  MeResponse,
  UpdateLearnerRequest,
} from '@learnbuddy/shared-types/contracts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../lib/api/client.js';
import { updateLearner } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { applyLocale } from '../../lib/i18n/index.js';
import { useMounted } from '../../lib/useMounted.js';
import { toast } from '../lb/Toast.js';

type Change = Omit<UpdateLearnerRequest, 'version'>;

export function useLearnerSave(learner: LearnerView, active: boolean) {
  const mounted = useMounted();
  const { t } = useTranslation('settings');
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
  const feedback = useRef({ owner: learner.id, active, epoch: 0 });
  if (feedback.current.owner !== learner.id || feedback.current.active !== active) {
    feedback.current = { owner: learner.id, active, epoch: feedback.current.epoch + 1 };
  }
  useEffect(() => {
    setError(null);
  }, [active, learner.id]);

  async function patch(change: Change): Promise<void> {
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

  return { patch, saving, error };
}
