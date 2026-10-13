// The line under the parents' PIN pad (app/pin.tsx): what it says, and whether it is about the
// entry she is replacing (`passes`: a wrong PIN) or still true while she types (a lockout, no PIN
// set, a failed request).

export type PinError = { text: string; passes: boolean };

/** Her first key of the next PIN: the wrong-PIN line goes with the red dots, anything else stays. */
export const afterFirstKey = (error: PinError | null): PinError | null =>
  error?.passes ? null : error;
