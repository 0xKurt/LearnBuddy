// A calibrated room-relative gate ends her recording after a short pause (#932).
import { NoiseFloor } from './noiseFloor.js';

const HEARD_MS = 250;
const PAUSE_MS = 650;
const MAX_STEP_MS = 200;
const MAX_GAP_MS = 200;
// Same dBFS domain as BargeGate; quiet nearby speech can clear this lower floor.
const MIN_DB = -50;
const MARGIN_DB = 6;

export class PauseEnd {
  constructor(private readonly pauseMs = PAUSE_MS) {}

  private noise = new NoiseFloor(MIN_DB, MARGIN_DB);
  private heardMs = 0;
  private quietSince: number | null = null;
  private lastAt: number | null = null;

  get speaking(): boolean {
    return this.heardMs >= HEARD_MS;
  }

  nextTurn(heard = false): void {
    this.heardMs = heard ? HEARD_MS : 0;
    this.quietSince = null;
  }

  get ready(): boolean {
    return this.noise.threshold() !== null;
  }

  /** Recorder display level (0…1), converted back to its dBFS scale. */
  observe(level: number, now: number): boolean {
    if (!Number.isFinite(level) || level < 0 || level > 1) return false;
    return this.observeDb(level * 45 - 50, now);
  }

  /** Raw metering avoids treating the display's clamped silence as −50 dBFS noise. */
  observeDb(db: number, now: number): boolean {
    const step = this.lastAt === null ? 0 : now - this.lastAt;
    this.lastAt = now;
    if (!Number.isFinite(db)) return false;
    const dt = step > 0 && step <= MAX_STEP_MS ? step : 0;
    // Initial quiet frames already bound the floor. Do not learn her early onset or syllable
    // dips as room noise while the readiness calibration is still completing (#932).
    const bar = this.noise.threshold(false);
    this.noise.observe(db, now, dt, bar === null || (db < bar && this.heardMs === 0));
    if (bar === null) return false;
    if (db >= bar) {
      this.heardMs += dt;
      this.quietSince = null;
      return false;
    }
    this.quietSince ??= now;
    if (this.heardMs < HEARD_MS) {
      if (now - this.quietSince > MAX_GAP_MS) this.heardMs = 0;
      return false;
    }
    return now - this.quietSince >= this.pauseMs;
  }

  reset(): void {
    this.noise = new NoiseFloor(MIN_DB, MARGIN_DB);
    this.heardMs = 0;
    this.quietSince = null;
    this.lastAt = null;
  }
}
