export function workerLimits(env?: Record<string, string | undefined>): {
  maxWorkers?: number;
  minWorkers?: number;
};
