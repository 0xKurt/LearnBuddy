// One reading of the contact state (issue #205).
//
// Two screens said the opposite of each other. The parents' hand-over had its sentence
// HARDWIRED to "Push-Benachrichtigungen: aus", regardless of the box the parents had just
// ticked; the settings section read the saved value and said "Ja – nie nach 20:00 Uhr". Both
// were about the same learner at the same moment.
//
// Parents rely on exactly this statement — contact is opt-in and only they may loosen it
// (CLAUDE.md rule 6) — so the state must come from one place that cannot drift. Hence this
// module: both screens ask it, neither decides for itself.
//
// The hand-over line says what was PERMITTED, never what will be delivered. Whether a push
// actually arrives depends on the server's push capability and on this device's token, and
// neither is known on the hand-over screen (it fetches nothing — it is the form that just
// submitted). Promising delivery there would be a claim nobody checked (rule 5); the settings
// section, which does know, carries that caveat (`contact.push_off_server`).

/** Off, allowed, or allowed but paused for a few days. */
export type ContactState = 'off' | 'paused' | 'on';

export function contactState(facts: {
  enabled: boolean;
  /** The last day of a pause, or null. */
  pausedUntil: string | null;
}): ContactState {
  if (!facts.enabled) return 'off';
  return facts.pausedUntil ? 'paused' : 'on';
}

/**
 * The hand-over's contact line. A pause cannot exist yet at hand-over — the profile was
 * created seconds ago — so there are two lines, not three, and `contactState` is what decides
 * which: the same function the settings use.
 */
export function handoverContactKey(
  enabled: boolean,
): 'profile.handover_contact_on' | 'profile.handover_contact_off' {
  return contactState({ enabled, pausedUntil: null }) === 'off'
    ? 'profile.handover_contact_off'
    : 'profile.handover_contact_on';
}
