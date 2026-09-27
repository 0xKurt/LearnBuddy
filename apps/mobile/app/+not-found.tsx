// A link to a screen that does not exist (an old notification, a typo in a deep link):
// the start screen decides where she belongs (deep-link-unmatched-and-talk-back).

import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/" />;
}
