import { useMounted } from '../../lib/useMounted.js';
// One close-boundary handoff; route/account replacement and lost eligibility revoke pending work.
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { currentSession, onSessionChange } from '../../lib/auth/session.js';
export function useSheetHandoff({
  enabled = true,
  visible = false,
  onClose,
  onInvalidated = onClose,
}: {
  enabled?: boolean;
  visible?: boolean;
  onClose: () => void;
  onInvalidated?: () => void;
}) {
  const pathname = usePathname();
  const latest = useRef({ enabled, onClose, onInvalidated });
  latest.current = { enabled, onClose, onInvalidated };
  const epoch = useRef(0);
  const alive = useMounted();
  const pending = useRef<{ epoch: number; run: () => void } | null>(null);
  const scope = useRef({ pathname, enabled, visible, owner: currentSession()?.user_id });
  const invalidated =
    scope.current.pathname !== pathname ||
    (scope.current.enabled && !enabled) ||
    (!scope.current.visible && visible);
  if (invalidated) {
    epoch.current += 1;
    pending.current = null;
  }
  scope.current.pathname = pathname;
  scope.current.enabled = enabled;
  scope.current.visible = visible;
  const cancel = useCallback(() => {
    epoch.current += 1;
    pending.current = null;
  }, []);
  const committedPath = useRef(pathname);
  useLayoutEffect(() => {
    cancel();
    if (committedPath.current !== pathname || !enabled) latest.current.onInvalidated();
    committedPath.current = pathname;
    return cancel;
  }, [pathname, enabled, cancel]);
  useEffect(
    () =>
      onSessionChange((session) => {
        if (scope.current.owner !== session?.user_id) {
          cancel();
          latest.current.onInvalidated();
        }
        scope.current.owner = session?.user_id;
      }),
    [cancel],
  );
  useEffect(() => cancel, [cancel]);
  const begin = useCallback((run: () => void) => {
    if (!alive.current || !latest.current.enabled || pending.current) return false;
    pending.current = { epoch: epoch.current, run };
    latest.current.onClose();
    return true;
  }, []);
  const closed = useCallback((expected: number | undefined) => {
    const action = pending.current;
    if (!action || expected !== action.epoch) return;
    pending.current = null;
    if (alive.current && latest.current.enabled && action?.epoch === epoch.current) action.run();
  }, []);
  const expected = pending.current?.epoch;
  return { begin, closed: () => closed(expected), cancel };
}
