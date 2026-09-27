// The web has no talk-mode tones (optional there; a browser may refuse sound
// before a tap). Same interface as lib/speech/cues.ts.

export type Cue = 'listen' | 'done';

export const CUE_MS = 0;

export async function playCue(_cue: Cue): Promise<void> {
  // Nothing to play in the browser.
}
