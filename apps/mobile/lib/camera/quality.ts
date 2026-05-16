// Local photo quality scoring. Doc 05 §Capture.
//
// Pure functions: pixels + sensor input → numeric scores → status classification.
// No React Native imports here; the call sites in lib/camera/decode.ts and
// app/(learner)/capture.tsx own the platform glue. This split keeps the math
// unit-testable the day the mobile vitest infra slice lands (precedent set by
// the Slice A3 PIN module follow-up).

/** Pixel format expected by the scorers: a single-channel 8-bit grayscale buffer
 *  laid out row-major (data[y * width + x]). Produced by decode.ts. */
export type Grayscale = {
  data: Uint8Array;
  width: number;
  height: number;
};

/** Raw sensor reading from expo-sensors DeviceMotion.accelerationIncludingGravity. */
export type Accel = { x: number; y: number; z: number };

export type QualityStatus = 'green' | 'yellow' | 'red';
export type QualityReason =
  | null
  | 'too_small'
  | 'blur'
  | 'blur_ok'
  | 'too_dark'
  | 'too_bright'
  | 'tilt';

export type QualityScore = {
  blur: number;
  brightness: number;
  tilt: number | null;
  width: number;
  height: number;
};

export type QualityVerdict = {
  status: QualityStatus;
  reason: QualityReason;
};

/** Laplacian variance over a 3×3 stencil. The classic "blur detector": low
 *  variance ⇒ flat / out-of-focus, high variance ⇒ sharp edges. Border pixels
 *  are skipped. Threshold bands defined by Doc 05 §Capture. */
export function scoreBlur(g: Grayscale): number {
  const { data, width, height } = g;
  if (width < 3 || height < 3) return 0;

  const interiorCount = (width - 2) * (height - 2);
  const samples = new Float32Array(interiorCount);
  let k = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const c = data[i] as number;
      const left = data[i - 1] as number;
      const right = data[i + 1] as number;
      const up = data[i - width] as number;
      const down = data[i + width] as number;
      samples[k++] = -4 * c + left + right + up + down;
    }
  }

  let mean = 0;
  for (let i = 0; i < interiorCount; i++) mean += samples[i] as number;
  mean /= interiorCount;

  let variance = 0;
  for (let i = 0; i < interiorCount; i++) {
    const d = (samples[i] as number) - mean;
    variance += d * d;
  }
  return variance / interiorCount;
}

/** Mean luminance in [0, 255]. */
export function scoreBrightness(g: Grayscale): number {
  const { data } = g;
  const n = data.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i] as number;
  return sum / n;
}

/** Angle in degrees between the gravity vector and the nearest cardinal axis.
 *  0° = the device is held flat against one of its faces (portrait, landscape,
 *  or screen-down); ~45° is the worst-aligned diagonal. The caller decides
 *  whether to warn (Doc 05 says warn > 25° but never block). */
export function scoreTilt(a: Accel): number {
  const total = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (total === 0) return 0;
  const main = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));
  const ratio = Math.min(1, main / total);
  return (Math.acos(ratio) * 180) / Math.PI;
}

/** Apply the Doc 05 §Capture threshold bands. Resolution gate is hard-fail
 *  (too_small); blur and brightness drive the red/yellow/green chip; tilt is
 *  a soft warning that yields yellow if everything else is green. */
export function classify(score: QualityScore): QualityVerdict {
  if (score.width < 800 || score.height < 600) {
    return { status: 'red', reason: 'too_small' };
  }
  if (score.brightness < 50) return { status: 'red', reason: 'too_dark' };
  if (score.brightness > 220) return { status: 'red', reason: 'too_bright' };
  if (score.blur < 60) return { status: 'red', reason: 'blur' };
  if (score.blur < 100) return { status: 'yellow', reason: 'blur_ok' };
  if (score.tilt !== null && score.tilt > 25) return { status: 'yellow', reason: 'tilt' };
  return { status: 'green', reason: null };
}
