// Admin surface layout. Doc 05 §Admin surface — every entry must pass
// through the unlock screen. Setting initialRouteName="unlock" ensures
// each fresh mount of the admin modal lands there first.

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useHierarchicalBack } from '../../lib/navigation/hierarchy.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function AdminLayout() {
  const setAdminUnlocked = useAppStore((s) => s.set_admin_unlocked);

  useHierarchicalBack();

  // Lock admin whenever the app moves to background so re-entry always
  // requires re-authentication (biometric / PIN).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        setAdminUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [setAdminUnlocked]);

  return (
    <Stack
      initialRouteName="unlock"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LB.paper },
        // Hierarchical back only — disable the iOS swipe-back gesture so it
        // can't replay navigation history.
        gestureEnabled: false,
      }}
    />
  );
}
