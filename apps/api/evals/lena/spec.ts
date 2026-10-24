// requires live verification in Claude Code session
import type { Journey } from './run.js';
export type Spec = {
  id: string;
  title: string;
  from: string;
  at?: string;
  run: (j: Journey) => Promise<void>;
};
