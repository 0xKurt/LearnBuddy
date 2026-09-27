import type { BuddyHome, LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys } from '../keys.js';
import { followHome, followMaterial, libraryPollMs, libraryReading } from '../libraryCache.js';

const material = (over: Partial<MaterialView> = {}): MaterialView => ({
  id: '00000000-0000-4000-8000-000000000001',
  title: null,
  status: 'processing',
  failure_reason: null,
  photos_deleted: false,
  item_count: 0,
  subject_name: null,
  goal_id: null,
  purpose: 'study',
  session_id: null,
  session_status: null,
  page_problems: [],
  photo_count: 2,
  merged_into: null,
  created_at: '2026-09-27T13:07:40.000Z',
  ...over,
});

const library = (...unsorted: MaterialView[]): LibraryView => ({ subjects: [], unsorted });

describe('"Mein Stoff" follows a sheet being read (live finding 3)', () => {
  it('is fetched often while a sheet is read, not by itself otherwise', () => {
    expect(libraryPollMs(library(material()))).toBe(2500);
    expect(libraryPollMs(library(material({ status: 'queued' })))).toBe(2500);
    expect(libraryPollMs(library(material({ status: 'ready' })))).toBe(false);
    // An upload given up on is not being read.
    expect(libraryPollMs(library(material({ status: 'awaiting_upload' })))).toBe(false);
    expect(libraryPollMs(undefined)).toBe(false);
  });

  it('takes the finished sheet from its own screen at once', () => {
    const client = new QueryClient();
    client.setQueryData(keys.library, library(material()));
    followMaterial(
      client,
      material({ status: 'ready', title: 'Die Zelle', subject_name: 'Biologie', item_count: 9 }),
    );
    const view = client.getQueryData<LibraryView>(keys.library)!;
    expect(view.unsorted[0]).toMatchObject({ status: 'ready', title: 'Die Zelle' });
    expect(libraryReading(view)).toBe(false);
    expect(client.getQueryState(keys.library)?.isInvalidated).toBe(true);
  });

  it('is fetched again when the home says nothing is being read any more', () => {
    const client = new QueryClient();
    client.setQueryData(keys.library, library(material()));
    followHome(client, { working: 'material', now: null } as unknown as BuddyHome);
    expect(client.getQueryState(keys.library)?.isInvalidated).toBe(false);
    followHome(client, { working: null, now: null } as unknown as BuddyHome);
    expect(client.getQueryState(keys.library)?.isInvalidated).toBe(true);
  });
});
