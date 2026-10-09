// How long one request took to reach its milestones (issue #447, docs/architecture.md §Speed).
//
// The wait she feels before Buddy's first word is measured on the phone (#169: 2.65 s); the
// database shows when the model call started and how long it ran. What neither shows is the
// sign-in check before the work starts and when the first words left the server. A streamed
// call therefore writes one line to the log —
//   [timing] POST /v1/buddy/messages auth=61 start=74 first=2012 done=2493
// — milliseconds since the request reached the API. Lined up with the phone's own `lb-perf`
// line of the same minute, the device's number splits into the way there and back, the
// sign-in, the server's work and the model. The route pattern and numbers only: no ids, no
// words (logs carry no personal details).
//
// A stopwatch, not the app clock (rule 7): nothing is decided by it and nothing is stored, and
// a monotonic counter cannot jump with a clock correction mid-request (as in llm/retry.ts).

/** auth: the sign-in service vouched for the token · start: the work began · first: the first
 *  progress event was written · done / error: the stream ended with its result or a failure. */
type Milestone = 'auth' | 'start' | 'first' | 'done' | 'error';

export class Timeline {
  private readonly started: number;
  private readonly reached: Array<[Milestone, number]> = [];

  constructor(private readonly elapsed: () => number = () => performance.now()) {
    this.started = elapsed();
  }

  /** Only the first time counts: a milestone is the moment it was first reached. */
  mark(milestone: Milestone): void {
    if (this.reached.some(([m]) => m === milestone)) return;
    this.reached.push([milestone, Math.round(this.elapsed() - this.started)]);
  }

  /** The log line for `route` ("POST /v1/buddy/messages"), milestones in the order reached. */
  line(route: string): string {
    return `[timing] ${route} ${this.reached.map(([m, ms]) => `${m}=${ms}`).join(' ')}`;
  }
}
