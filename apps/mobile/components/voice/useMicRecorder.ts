// One recorder lifecycle for pronunciation, word practice and rehearsal (#918).
import { useEffect, useState } from 'react';

import { stop as stopListening } from '../../lib/speech/listen.js';
import { useRecording, type RecordFailure } from '../../lib/speech/record.js';
import type { MicControl } from './MicButton.js';

type Options = Parameters<typeof useRecording>[0];

export function useMicRecorder({
  resetKey,
  ...options
}: Omit<Options, 'onFailed'> & { onFailed?: Options['onFailed']; resetKey?: string }) {
  const [hint, setHint] = useState<Exclude<RecordFailure, 'denied'> | null>(null);
  useEffect(() => setHint(null), [resetKey]);
  const rec = useRecording({
    ...options,
    onFailed: (why) => {
      setHint(why === 'denied' ? null : why);
      options.onFailed?.(why);
    },
  });
  function start() {
    setHint(null);
    stopListening();
    return rec.start();
  }
  const voice: MicControl = {
    state: rec.phase,
    elapsedMs: rec.elapsedMs,
    maxMs: rec.maxMs,
    denied: rec.denied,
    hint,
    live: '',
    toggle: () => {
      if (rec.phase === 'recording') void rec.stop();
      else void start();
    },
  };
  return { ...rec, start, voice };
}
