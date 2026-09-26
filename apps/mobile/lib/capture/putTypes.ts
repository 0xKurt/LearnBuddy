/** What happened to one photo upload (put.ts on a phone, put.web.ts in a browser). */
export type PutResult =
  | { kind: 'response'; status: number; body: string }
  | { kind: 'network' }
  | { kind: 'file' };
