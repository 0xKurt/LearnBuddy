// Reduced motion stops every transition, including fades (redesign, #548).
/** Who decides whether a cross-fade plays at all. */
export type FadePolicy = 'always' | 'system';

/** What an element entering the screen does. */
export type EnterPlan = {
  /** `true`: it rises into place. `false`: it fades in place and nothing moves. */
  moves: boolean;
  /** Whether the cross-fade itself survives the system's reduce-motion setting. */
  fade: FadePolicy;
};

/** All transitions follow the system reduced-motion preference. */
export function fadePolicy(_platform: string): FadePolicy {
  return 'system';
}

/** How something enters: the fade alone, or the fade with its small rise. */
export function enterPlan(reduced: boolean, platform: string): EnterPlan {
  // The web never rises either — same Reanimated 4.1 web bug as above.
  return { moves: !reduced && platform !== 'web', fade: fadePolicy(platform) };
}
