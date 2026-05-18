import * as SecureStore from 'expo-secure-store';

const KEY = 'lb_session_count';

/** Increments the session counter and returns true when it reaches 3 (once only). */
export async function incrementAndCheckRating(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(KEY);
  const count = parseInt(raw ?? '0', 10) + 1;
  await SecureStore.setItemAsync(KEY, String(count));
  return count === 3;
}
