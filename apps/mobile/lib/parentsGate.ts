// Who may open the parents' area (docs/privacy.md §PIN gate, user feedback #13,
// DESIGN-BRIEF "the admin surface is always gated"). For a minor's profile it opens
// only with the parents' PIN — the e-mail, sign-out, export and deletion are theirs.
// "PIN vergessen?" opens only the PIN card, where a new PIN needs the account's
// password (components/settings/PinCard.tsx). Opening is its own step: the PIN is
// dropped right after, and each gated action inside asks again. Without a PIN set
// yet there is nothing to ask for: the area opens, so a PIN can be set.

export type ParentsView = 'all' | 'pin_only';

export type GateDeps = {
  /** Opens the PIN screen for the step; true once the PIN was right. */
  request: () => Promise<boolean>;
  /** Whether the PIN screen was left with "PIN vergessen?". */
  takeForgot: () => boolean;
  /** Drops the admin token. */
  clear: () => void;
};

/** What of the parents' area opens now (null: stays closed). */
export async function openParents(
  who: { minor: boolean; pinSet: boolean },
  deps: GateDeps,
): Promise<ParentsView | null> {
  if (!who.minor || !who.pinSet) return 'all';
  const ok = await deps.request();
  deps.clear();
  if (ok) return 'all';
  return deps.takeForgot() ? 'pin_only' : null;
}
