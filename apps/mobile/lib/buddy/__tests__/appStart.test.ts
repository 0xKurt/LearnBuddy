import { beforeEach, describe, expect, it, vi } from 'vitest';

// A cold start is a property of the process, so each case gets its own: resetting the module
// registry is what "she closed the app and opened it again" means here.
describe('takeColdStart', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('is true once per app start and false ever after', async () => {
    const { takeColdStart } = await import('../appStart.js');
    expect(takeColdStart()).toBe(true);
    // A second mount of the home in the same process is not a second start (issue #104).
    expect(takeColdStart()).toBe(false);
    expect(takeColdStart()).toBe(false);
  });

  it('a restart starts over', async () => {
    const first = await import('../appStart.js');
    expect(first.takeColdStart()).toBe(true);
    vi.resetModules();
    const restarted = await import('../appStart.js');
    expect(restarted.takeColdStart()).toBe(true);
  });
});
