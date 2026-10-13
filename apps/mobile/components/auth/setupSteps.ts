// The four things the setup settles, in the order the design counts them: privacy, the profile
// with the parents' part, Buddy's voice, the colours (ui_kits/app/Onboarding.jsx `Consent`
// "1 von 4", `ParentSetup` "2 von 4", `VoicePick` "3 von 4"; Gaps.jsx `LookPick` "4 von 4").
//
// One list, so no page counts for itself (#599): the three cards that explain Buddy before the
// colours used to say "Schritt 1–3 von 4" while the privacy page before them said nothing — two
// counts for one way. A page that settles nothing carries no number: those three cards and the
// hand-over. Every page of the profile (who learns, the parents, notifications) is the second of
// the four. Where Buddy's own voices are missing for her language the third is left out
// (issue #526) and the count goes from 2 to 4; whether they are there is only known once the
// profile exists, so the total cannot follow it.

export const SETUP_STATIONS = ['consent', 'profile', 'voice', 'look'] as const;
export type SetupStation = (typeof SETUP_STATIONS)[number];

/** Where a station stands: what `common:onboarding.step_label` is given. */
export function setupStep(station: SetupStation): { n: number; count: number } {
  return { n: SETUP_STATIONS.indexOf(station) + 1, count: SETUP_STATIONS.length };
}
