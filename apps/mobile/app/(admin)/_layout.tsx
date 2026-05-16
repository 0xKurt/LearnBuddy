// Admin surface layout. Doc 05 §Admin surface — every entry must pass
// through the unlock screen. Setting initialRouteName="unlock" ensures
// each fresh mount of the admin modal lands there first.

import { Stack } from 'expo-router';
import { LB } from '../../lib/theme/colors.js';

export default function AdminLayout() {
  return (
    <Stack
      initialRouteName="unlock"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LB.paper },
      }}
    />
  );
}
