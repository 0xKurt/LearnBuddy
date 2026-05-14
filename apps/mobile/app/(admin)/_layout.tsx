import { Stack } from 'expo-router';
import { LB } from '../../lib/theme/colors.js';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LB.paper },
      }}
    />
  );
}
