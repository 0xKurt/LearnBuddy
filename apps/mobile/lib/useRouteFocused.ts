// Shared route focus eligibility; Expo owns navigation and its focus/blur lifetime.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export function useRouteFocused(): boolean {
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  return active;
}
