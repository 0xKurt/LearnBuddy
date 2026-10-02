// Sends what the app measured about her waiting, summed up (issue #169, lib/perf.ts).
//
// When: once 30 measurements are waiting, and whenever the app goes to the background — so a
// short session still reports, and nothing is sent while she is in the middle of something.
// Only while signed in (the API takes reports only from the app). A report that cannot go out
// (offline, server trouble) is given back and travels with the next one; one the API refuses for
// good is dropped. Nothing is kept on disk: a killed app loses at most one session's numbers.

import type { PerfReport as PerfReportSchema } from '@learnbuddy/shared-types/contracts';
import { AppState, Platform } from 'react-native';
import { z } from 'zod';

import { ApiError, request } from './api/client.js';
import { currentSession } from './auth/session.js';
import { giveBack, onMeasured, takeReport } from './perf.js';

declare const __DEV__: boolean;

/** Measurements waiting before a report goes out on its own. */
const BATCH = 30;

let sending = false;

function platform(): PerfReportSchema['platform'] {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

/** Sends what is waiting, if anything and if signed in. Never throws. */
export async function sendPerfReport(): Promise<void> {
  if (sending || !currentSession()) return;
  const report = takeReport(
    platform(),
    typeof __DEV__ !== 'undefined' && __DEV__ ? 'dev' : 'release',
  );
  if (!report) return;
  sending = true;
  try {
    await request('POST', '/perf', {
      body: report,
      schema: z.object({ ok: z.boolean() }),
    });
  } catch (err) {
    // A clear "no" (an app older than the list of actions, say) would be refused again.
    const refused =
      err instanceof ApiError &&
      err.status >= 400 &&
      err.status < 500 &&
      ![401, 408, 429].includes(err.status);
    if (!refused) giveBack(report);
  } finally {
    sending = false;
  }
}

/** Starts reporting; returns the way to stop (root layout). */
export function startPerfReports(): () => void {
  const offMeasured = onMeasured((pending) => {
    if (pending >= BATCH) void sendPerfReport();
  });
  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void sendPerfReport();
  });
  return () => {
    offMeasured();
    sub.remove();
  };
}
