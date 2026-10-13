// The four things the setup settles, in the order the design counts them: privacy, the profile
// with the parents' part, Buddy's voice, the colours (ui_kits/app/Onboarding.jsx `Consent`
// "1 von 4", `ParentSetup` "2 von 4", `VoicePick` "3 von 4"; Gaps.jsx `LookPick` "4 von 4").
//
// One list, so no page counts for itself (#599): the three cards that explain Buddy before the
// colours used to say "Schritt 1–3 von 4" while the privacy page before them said nothing — two
// counts for one way. A page that settles nothing carries no number: those three cards and the
// hand-over. Every page of the profile (who learns, the parents, notifications) is the second.
//
// The count never says what is not true. The voice page exists only where Buddy's own voices are
// there for her language (issue #526), and that is known once the profile exists — so:
//   · privacy and the profile say which step they are, without a total ("Schritt 1", "Schritt 2"):
//     whether three or four follow cannot be known yet;
//   · the voice page, when it is shown, is "3 von 4";
//   · the colours are "4 von 4" after a voice page and "3 von 3" without one — and carry no
//     number when this run of the app did not see which it was (opened on the cards).

export const SETUP_STATIONS = ['consent', 'profile', 'voice', 'look'] as const;
export type SetupStation = (typeof SETUP_STATIONS)[number];

/** Which step, and of how many where that is certain. */
export type SetupCount = { n: number; count?: number };

/**
 * Whether the voice page was shown on this way through the setup. A module value like the
 * tour's kept card (app/onboarding.tsx): it belongs to this run of the app, not to the device.
 */
const way: { voice: boolean | undefined } = { voice: undefined };

/** The profile page says it the moment it decides (`toVoice`); `undefined` = not seen. */
export function noteVoiceStep(shown: boolean | undefined): void {
  way.voice = shown;
}

/** Where a station stands, or null where no true number can be given. */
export function setupStep(
  station: SetupStation,
  voice: boolean | undefined = way.voice,
): SetupCount | null {
  const total = SETUP_STATIONS.length;
  if (station === 'consent') return { n: 1 };
  if (station === 'profile') return { n: 2 };
  if (station === 'voice') return { n: 3, count: total };
  if (voice === undefined) return null;
  return voice ? { n: total, count: total } : { n: total - 1, count: total - 1 };
}
