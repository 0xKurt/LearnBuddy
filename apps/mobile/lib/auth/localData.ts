// Pure decision for lib/localWork.ts: whose unsent answers and photos survive a sign-in.

/**
 * `keep` when the device's leftovers are hers (or nobody's recorded yet: a
 * first sign-in, or an install from before owners were recorded); `wipe` when
 * they belong to someone else — a shared phone never hands over another
 * person's answers or photos.
 */
export function localDataOnSignIn(owner: string | null, userId: string): 'keep' | 'wipe' {
  return owner !== null && owner !== userId ? 'wipe' : 'keep';
}
