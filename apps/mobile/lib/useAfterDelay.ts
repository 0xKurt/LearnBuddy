// "This has been going on for a while" (#686): true once `active` has stayed true for `ms`, false
// again the moment it ends. A turn that takes longer than usual says so, instead of three still
// dots for up to three minutes (TURN_STALL_MS).

import { useEffect, useState } from 'react';

/** True after `active` has been true for `ms` without a break; false whenever it is not. */
export function useAfterDelay(active: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!active) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && late;
}
