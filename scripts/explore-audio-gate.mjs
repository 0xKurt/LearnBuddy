import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const evidence = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const required = ['pitch', 'noise', 'sentenceEnd', 'mutedSilence', 'languagePackRecognition'];
if (
  evidence.build !== head ||
  evidence.device !== '35b1c1c' ||
  !evidence.reviewer ||
  !evidence.recording ||
  !evidence.inputAudio ||
  required.some((key) => evidence[key] !== true)
) {
  throw new Error('Audio evidence missing, stale, or failed; release blocked');
}
for (const path of [evidence.recording, evidence.inputAudio]) {
  if (statSync(path).size <= 44) throw new Error('Audio evidence is empty');
}
console.info('Reviewed device audio evidence matches this build');
