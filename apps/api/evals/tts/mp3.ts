// How long an MP3 plays, from its frame headers. Used by evals/tts/run.ts (the timeline of a
// whole turn) and evals/tts/opening.ts (does the first piece play long enough to cover the
// synthesis of the next one?).
// requires live verification in Claude Code session (part of the live TTS evals)

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

/**
 * Playing time of an MP3 in seconds, from its Layer III frame headers (the provider answers
 * with MP3; the phone plays exactly these bytes). Frames are walked, not estimated from the
 * average bitrate, so a variable-rate stream is right too.
 */
export function mp3Seconds(buf: Buffer): number {
  let at = 0;
  let seconds = 0;
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff || (buf[at + 1]! & 0xe0) !== 0xe0) {
      at++;
      continue;
    }
    const version = (buf[at + 1]! >> 3) & 0x3;
    const layer = (buf[at + 1]! >> 1) & 0x3;
    const bitrateBits = (buf[at + 2]! >> 4) & 0xf;
    const rateBits = (buf[at + 2]! >> 2) & 0x3;
    const padding = (buf[at + 2]! >> 1) & 0x1;
    const rates = RATES[version];
    // Layer III only (01); anything else is a false sync inside the payload.
    if (layer !== 1 || !rates || rateBits === 3 || bitrateBits === 0 || bitrateBits === 15) {
      at++;
      continue;
    }
    const sampleRate = rates[rateBits]!;
    const kbps = (version === 3 ? MPEG1_L3 : MPEG2_L3)[bitrateBits]!;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor((samples / 8) * ((kbps * 1000) / sampleRate)) + padding;
    if (length <= 4) {
      at++;
      continue;
    }
    seconds += samples / sampleRate;
    at += length;
  }
  return seconds;
}
