// The four things the setup settles, in the order the design counts them: privacy, the profile
// with the parents' part, Buddy's voice, the colours (ui_kits/app/Onboarding.jsx `Consent`
// "1 von 4", `ParentSetup` "2 von 4", `VoicePick` "3 von 4"; Gaps.jsx `LookPick` "4 von 4").
//
// One list, so no page counts for itself (#599): the three cards that explain Buddy before the
// colours used to say "Schritt 1–3 von 4" while the privacy page before them said nothing — two
// counts for one way. A page that settles nothing carries no number: those three cards and the
// hand-over. Every page of the profile (who learns, the parents, notifications) is the second.
//
// The normal way is the design's: 1, 2, 3, 4 of 4. The voice page exists only where Buddy's own
// voices are there for her language (issue #526) and the settings could be read — the server says
// so in the learner's settings, which exist only once the profile does. Nothing the app reads
// before that carries it (`/me` has `capabilities.model|push`, no voice; `/v1/health` is the
// operators' page, has no contract and knows the provider but not her language), so the early
// pages count to the design's four. Where the voice page was then left out, the count never
// skips a number: the colours are "3 von 3", not "4 von 4" after a step that was not there. When
// this run of the app did not walk the setup (opened on the cards), they carry no number.

export const SETUP_STATIONS = ['consent', 'profile', 'voice', 'look'] as const;
export type SetupStation = (typeof SETUP_STATIONS)[number];

/**
 * Whether the voice page was shown on this way through the setup. A module value like the
 * tour's kept card (app/onboarding.tsx): it belongs to this run of the app, not to the device.
 */
const way: { voice: boolean | undefined } = { voice: undefined };

/** The profile page says it the moment it decides (`toVoice`); `undefined` = not seen. */
export function noteVoiceStep(shown: boolean | undefined): void {
  way.voice = shown;
}

/** Where a station stands (what `common:onboarding.step_label` is given), or null: no number. */
export function setupStep(
  station: SetupStation,
  voice: boolean | undefined = way.voice,
): { n: number; count: number } | null {
  const total = SETUP_STATIONS.length;
  if (station !== 'look') return { n: SETUP_STATIONS.indexOf(station) + 1, count: total };
  if (voice === undefined) return null;
  return voice ? { n: total, count: total } : { n: total - 1, count: total - 1 };
}
