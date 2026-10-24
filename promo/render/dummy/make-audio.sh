#!/usr/bin/env bash
# Test voice-over for the dummy film: sine tones, one pitch per segment, so the mix and its
# timing can be checked by ear and with silencedetect. 24 kHz mono, like typical TTS output.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio
FF=${FFMPEG:-/usr/local/bin/ffmpeg}
tone() { # name frequency seconds [ext]
  "$FF" -v error -y -f lavfi -i "sine=frequency=$2:duration=$3:sample_rate=24000" -af "volume=-14dB,afade=t=in:d=0.02,afade=t=out:st=$(echo "$3 - 0.03" | bc):d=0.03" -ac 1 "audio/$1.${4:-wav}"
}
# de: intro longer than 1.9 s → intro grows; scene 2 (2 parts) longer than its clip → freeze-hold; scene 3 silent
tone de-intro 330 2.4
tone de-s1    440 3.0
tone de-s2a   550 2.2 mp3   # scene 2 = two sentences (mp3 + wav), 350 ms apart
tone de-s2b   600 1.8
tone de-outro 660 3.2
# en: short intro (stays 2.5 s); scene 1 slightly longer than its clip; silent outro
tone en-intro 330 1.6
tone en-s1    440 3.8
tone en-s2    550 2.5
tone en-s3    495 3.9 mp3
ls -l audio
