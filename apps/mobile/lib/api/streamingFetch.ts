// A fetch whose response body can be read while it arrives: expo/fetch on the
// phone (React Native's own fetch only hands over the whole body at the end).
import { fetch as expoFetch } from 'expo/fetch';

export const streamingFetch = (url: string, init: RequestInit): Promise<Response> =>
  expoFetch(url, init as Parameters<typeof expoFetch>[1]) as unknown as Promise<Response>;
