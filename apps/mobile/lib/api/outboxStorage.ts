// Where the outbox lives on a phone: AsyncStorage (the web: outboxStorage.web.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'lb.outbox.v1';

export async function readOutbox(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeOutbox(value: string | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, value);
  } catch {
    // Storage full or unavailable: the answer is still being sent right now.
  }
}
