// Whether what a component draws can be seen right now (issue #637): its screen is the one on
// top and the app is in the foreground.
//
// A stack keeps the screens below the top one mounted: the chat stays under a practice, under
// "Dein Material", under the settings and under Talk. What moves there by itself keeps costing
// the phone although nobody can see it — Buddy's orb steps its moon on the UI thread every frame,
// and on the POCO X3 the two orbs of the chat kept that thread busy (≈ 1 core, every frame late)
// while she worked on the practice on top. Things that move on their own ask this first.
//
// Outside a navigator (the root's loading state, a component test) a screen counts as on top.

import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** True while the surrounding route is focused (or there is no route around it). */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/** True while the app is in the foreground ("active"; a web page always is). */
function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** Its screen is on top and the app is in front: what moves by itself may move. */
export function useOnScreen(): boolean {
  const focused = useScreenFocused();
  const active = useAppActive();
  return focused && active;
}
