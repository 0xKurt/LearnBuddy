// The browser's ear while Buddy speaks (issue #35): the microphone with the browser's own
// echo cancellation switched on explicitly, read only as a LEVEL through an analyser — no
// MediaRecorder, nothing kept, nothing sent. lib/speech/bargeIn.ts decides what the level
// means. Opened only while the talk screen says so, closed the moment it stops saying so.
//
// The open stream is also what makes listening start without a gap (issue #41): the talk
// screen keeps it until the recorder runs, so the recorder's own `getUserMedia` finds the
// device already open instead of waking it.

import { useEffect, useRef } from 'react';

import { rmsDb } from './bargeIn.js';

/** How often the level is read. */
const FRAME_MS = 50;

export type BargeMonitorOptions = {
  /** Open the mic now (Buddy speaks, conversation mode, no screen reader). */
  active: boolean;
  /** One level reading in dBFS, with the time it was taken. */
  onLevel: (db: number, at: number) => void;
};

/** Whether this platform can listen for her while Buddy speaks. */
export const bargeSupported =
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof AudioContext !== 'undefined';

export type BargeMonitor = {
  /**
   * Always null — nothing to wait for: the browser shares one open device between both
   * streams, and the open one is what lets the recorder start without waking the device. It
   * closes when `active` turns false.
   */
  release: () => Promise<void> | null;
};

export function useBargeMonitor({ active, onLevel }: BargeMonitorOptions): BargeMonitor {
  const levelRef = useRef(onLevel);
  levelRef.current = onLevel;

  useEffect(() => {
    if (!active || !bargeSupported) return;
    let closed = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            // The point of it all: what the speaker plays is taken out of what the mic hears.
            echoCancellation: true,
            noiseSuppression: true,
            // A gain that rises while he speaks would lift his residue towards her level.
            autoGainControl: false,
          },
        });
        if (closed) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        const c = new AudioContext();
        ctx = c;
        // Created after her taps on this page, but a browser may still start it suspended.
        await c.resume().catch(() => undefined);
        const analyser = c.createAnalyser();
        analyser.fftSize = 1024;
        c.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          levelRef.current(rmsDb(buf), Date.now());
        }, FRAME_MS);
      } catch {
        // No mic (refused, busy): no barge-in — the tap on Buddy still interrupts him.
      }
    })();
    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      void ctx?.close().catch(() => undefined);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [active]);

  return { release: () => null };
}
