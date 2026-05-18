// Removed: separate adult hand-off flow eliminated. Redirect to add-profile.
import { Redirect } from 'expo-router';
export default function HandOffToAdultRedirect() {
  return <Redirect href={'/(onboarding)/add-profile' as never} />;
}
