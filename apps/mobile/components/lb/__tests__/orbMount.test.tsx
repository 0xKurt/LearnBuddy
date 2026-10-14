// Mounting Buddy's orb, the entrances, the skeleton and the loading state reads none of their
// shared values across threads (issue #637). On the phone each `.value` read on the JS thread is a
// blocking call into the UI runtime; an orb mounts ~40 styles and runs each twice, and with the UI
// thread busy every call waited for it — a third of the JS time of opening Settings and of a chat
// reply on the POCO X3. At mount the values are what they were created with; the styles take those.

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ n: 0 }));

// On a phone, where a UI runtime runs the frames (on the web every frame reads the value itself:
// sharedReadWeb.test.tsx).
vi.mock('react-native', async (load) => {
  const real = await load<{ Platform: Record<string, unknown> }>();
  return { ...real, Platform: { ...real.Platform, OS: 'android' } };
});

vi.mock('react-native-reanimated', async (load) => {
  const real = await load<Record<string, unknown>>();
  const useSharedValue = real.useSharedValue as <T>(v: T) => { value: T };
  return {
    ...real,
    // A shared value that counts the reads made on the JS thread.
    useSharedValue: <T,>(initial: T) => {
      const sv = useSharedValue(initial);
      return {
        get value() {
          reads.n++;
          return sv.value;
        },
        set value(v: T) {
          sv.value = v;
        },
      };
    },
  };
});

const { BuddyOrb } = await import('../BuddyOrb.js');
const { Appear, Rise } = await import('../Motion.js');
const { Bone, SkeletonGroup } = await import('../Skeleton.js');
const { LoadingState } = await import('../LoadingState.js');

afterEach(() => {
  reads.n = 0;
});

describe('mounting the orb', () => {
  it.each([
    ['header', 30],
    ['Talk', 220],
  ])('the %s orb reads no shared value on the JS thread', (_, size) => {
    reads.n = 0;
    render(<BuddyOrb size={size} state="think" />);
    expect(reads.n).toBe(0);
  });

  it('the entrances, the skeleton and the loading state read none either', () => {
    reads.n = 0;
    render(
      <>
        <Appear>
          <span />
        </Appear>
        <Rise>
          <span />
        </Rise>
        <SkeletonGroup label="Lädt">
          <Bone height={10} />
        </SkeletonGroup>
        <LoadingState label="Lädt" />
      </>,
    );
    expect(reads.n).toBe(0);
  });
});
