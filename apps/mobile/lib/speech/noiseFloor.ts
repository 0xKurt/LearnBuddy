// Shared background/echo calibration for speech gates (#932, Engineering-Regel 3).
export const CALIBRATE_MS = 600;
const WINDOW_MS = 3000;
type Sample = { at: number; db: number };

export class NoiseFloor {
  private samples: Sample[] = [];
  private measuredMs = 0;

  constructor(
    private readonly minimumDb: number,
    private readonly marginDb: number,
  ) {}

  threshold(requireCalibration = true): number | null {
    if ((requireCalibration && this.measuredMs < CALIBRATE_MS) || this.samples.length === 0)
      return null;
    const sorted = this.samples.map((s) => s.db).sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil(0.9 * sorted.length) - 1);
    return Math.max(this.minimumDb, (sorted[index] ?? -160) + this.marginDb);
  }

  /** Count valid elapsed audio; only non-candidates teach the background. */
  observe(db: number, at: number, dt: number, background: boolean): void {
    if (!Number.isFinite(db)) return;
    this.measuredMs += dt;
    if (!background) return;
    this.samples.push({ at, db });
    const from = at - WINDOW_MS;
    while (this.samples.length > 0 && (this.samples[0]?.at ?? 0) < from) this.samples.shift();
  }
}
