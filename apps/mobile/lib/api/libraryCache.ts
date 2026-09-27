// "Mein Stoff" follows a sheet being read (live finding 3: the list still said
// "Ohne Titel · wird gelesen" after the reading was done, while the sheet itself
// showed its questions). Pure helpers, unit-tested; the queries use them.

import type { BuddyHome, LibraryView, MaterialView } from '@learnbuddy/shared-types/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { keys } from './keys.js';

// An upload given up on ("unvollständig") is not being read: it is not followed.
const reading = (m: MaterialView) => m.status === 'queued' || m.status === 'processing';

function all(view: LibraryView): MaterialView[] {
  return [...view.subjects.flatMap((s) => s.materials), ...view.unsorted];
}

/** Whether a sheet in the list is being read. */
export function libraryReading(view: LibraryView | undefined): boolean {
  return view ? all(view).some(reading) : false;
}

/** How often the list is fetched again: often while a sheet is being read, else not by itself. */
export function libraryPollMs(view: LibraryView | undefined): number | false {
  return libraryReading(view) ? 2500 : false;
}

/**
 * A fresher view of one sheet (its own screen fetched it): written into the list at once when
 * its status changed, and the list is fetched again for what depends on it (title, subject).
 */
export function followMaterial(client: QueryClient, fresh: MaterialView): void {
  const view = client.getQueryData<LibraryView>(keys.library);
  if (!view) return;
  const known = all(view).find((m) => m.id === fresh.id);
  if (!known || known.status === fresh.status) return;
  const patch = (list: MaterialView[]) => list.map((m) => (m.id === fresh.id ? fresh : m));
  client.setQueryData<LibraryView>(keys.library, {
    subjects: view.subjects.map((s) => ({ ...s, materials: patch(s.materials) })),
    unsorted: patch(view.unsorted),
  });
  void client.invalidateQueries({ queryKey: keys.library });
}

/** The home says nothing is being read any more: a list that still shows a reading is fetched again. */
export function followHome(client: QueryClient, home: BuddyHome): void {
  const busy = home.working === 'material' || home.now?.type === 'material_processing';
  if (busy) return;
  if (libraryReading(client.getQueryData<LibraryView>(keys.library))) {
    void client.invalidateQueries({ queryKey: keys.library });
  }
}
