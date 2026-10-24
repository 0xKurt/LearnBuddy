// requires live verification in Claude Code session
import decode from '@audio/decode';
import { mp3Seconds } from './mp3.js';
export async function audioSeconds(audio: Buffer, mime: string): Promise<number> {
  if (mime === 'audio/mpeg') return mp3Seconds(audio);
  const decoded = await decode(audio);
  return decoded.channelData[0]!.length / decoded.sampleRate;
}
