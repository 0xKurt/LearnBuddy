// Learner surface layout. Doc 05 §learner-surface.
// The bottom nav is rendered here so it stays put across child routes.

import { useQuery } from '@tanstack/react-query';
import { Slot, router, useSegments } from 'expo-router';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomNav, type NavKey } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { listSubjects } from '../../lib/api/subjects.js';
import { LB } from '../../lib/theme/colors.js';

function segmentToNavKey(seg: string | undefined): NavKey {
  if (seg === 'capture') return 'camera';
  if (seg === 'session' || seg === 'practice') return 'practice';
  return 'home';
}

export default function LearnerLayout() {
  const { t } = useTranslation('capture');
  const segments = useSegments();
  const tail = segments[segments.length - 1];
  const active = segmentToNavKey(tail);

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId!),
    enabled: !!learnerId,
  });

  const onNavigate = (k: NavKey) => {
    if (k === 'home') router.push('/(learner)/home');
    else if (k === 'camera') {
      if (!subjectsQuery.data?.length) {
        Alert.alert(t('picker.no_subjects_title'), t('picker.no_subjects'));
        return;
      }
      router.push('/(learner)/capture');
    } else if (k === 'practice') router.push('/(learner)/practice');
    else if (k === 'profile') router.push('/(admin)/unlock');
  };

  return (
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <BottomNav active={active} onNavigate={onNavigate} />
    </View>
  );
}
