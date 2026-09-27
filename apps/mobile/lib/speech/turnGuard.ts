// One listening belongs to one turn (audit M-78 handsfree-recording-outlives-turn): text
// from a listening that began before cancel() is dropped, even when it arrives later (a
// transcript still on its way). Pure, so the rule is unit-tested; useVoiceInput holds one.

export class TurnGuard {
  private generation = 0;
  private listening = 0;

  /** A listening starts; returns its token. */
  begin(): number {
    this.listening = this.generation;
    return this.listening;
  }

  /** Whatever is listening now, or on its way, no longer counts. */
  cancel(): void {
    this.generation += 1;
  }

  /** The latest listening still counts (nothing cancelled it). */
  current(): boolean {
    return this.listening === this.generation;
  }

  /** A listening with this token still counts. */
  holds(token: number): boolean {
    return token === this.generation;
  }
}
