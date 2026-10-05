// A part of the app loaded when a screen first needs it, not with the app (issues #312, #251):
// VexFlow for the note line, the shapes of the maps. `import()` makes it a bundle part of its own on
// the web, fetched with the first screen that shows it; on a device everything is in the app
// bundle anyway and the load is done at once.
//
//   export const useEngraver = lazyModule(() => import('./engrave.js'));
//
// The `import()` must stay in the caller's file, written out: the bundler splits at that call.

import { useEffect, useState } from 'react';

/**
 * A hook that gives the module once it is loaded, and null before. `wanted: false` loads nothing —
 * for a component that needs the module only sometimes (a tappable figure that is no map).
 */
export function lazyModule<T>(importer: () => Promise<T>): (wanted?: boolean) => T | null {
  let loaded: T | null = null;
  let loading: Promise<T> | null = null;

  const load = (): Promise<T> => {
    loading ??= importer().then(
      (mod) => {
        loaded = mod;
        return mod;
      },
      (error: unknown) => {
        // A network error on the web: try again with the next screen that needs it, rather than
        // leave it empty for the rest of the session.
        loading = null;
        throw error;
      },
    );
    return loading;
  };

  return function useLoaded(wanted = true): T | null {
    const [mod, setMod] = useState<T | null>(loaded);
    useEffect(() => {
      if (mod || !wanted) return;
      let live = true;
      load().then(
        (m) => {
          if (live) setMod(m);
        },
        () => undefined,
      );
      return () => {
        live = false;
      };
    }, [mod, wanted]);
    return wanted ? mod : null;
  };
}
