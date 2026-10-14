// A shared value inside an animated style, without the blocking read at mount (issue #637).
//
// A style's worklet runs once on the JS thread when its view mounts (twice: the hook and the
// component's first render). There `.value` is a blocking call into the UI runtime, and while the
// UI thread is busy every such call waits for it: on the POCO X3 a third of the JS time of opening
// Settings and of a chat reply went into these waits, mostly from Buddy's orb (~40 styles) and the
// skeleton bones. At mount a value is still what it was created with, so the JS-thread run takes
// that; on the UI thread the value itself is read, as before.
//
// Only where there IS a UI runtime. On the web Reanimated has none: every frame of every style
// runs on the JS thread with `_WORKLET` false, and `born` there froze the orb at its first pose and
// every entrance at its start (a new chat line stayed invisible). There, and in a test, the value
// itself is read — without a second runtime that read blocks nothing.

import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

/** A UI runtime runs the styles' frames; the JS thread only runs their first one. */
const UI_RUNTIME = Platform.OS !== 'web';

export function read<T>(sv: SharedValue<T>, born: T): T {
  'worklet';
  return !UI_RUNTIME || globalThis._WORKLET ? sv.value : born;
}
