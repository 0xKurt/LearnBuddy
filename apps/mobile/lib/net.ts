// Online or not, as far as the device knows. Pure (Node-testable); the NetInfo
// wiring into TanStack Query's onlineManager lives in lib/api/queries.ts.

type NetState = { isConnected: boolean | null };

/**
 * Only a device without any network counts as offline. NetInfo's
 * isInternetReachable is not used: it pings a fixed outside address, which
 * can fail while the LearnBuddy API is reachable (and is null at start). A
 * network that is up but cannot reach the API still ends in the API client's
 * 'network' error, as before. `null` (not known yet) counts as online.
 */
export function onlineFrom(state: NetState): boolean {
  return state.isConnected !== false;
}
