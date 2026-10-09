// Whether the component is still on the screen (issue #311, slice 6). An answer that arrives
// after she left — a request, a recording, a player's end — must not set the state of a screen
// that is gone. One hook for that question instead of a copy of the same ref and effect in every
// component that waits for something.
//
// Call it before the effects whose cleanup reads it: React runs cleanups in the order the hooks
// were called, so `current` is already false when they run.

import { useEffect, useRef } from 'react';

export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
