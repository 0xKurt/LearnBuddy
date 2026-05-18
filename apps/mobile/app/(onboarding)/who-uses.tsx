// Removed: flow merged into add-profile. Kept as redirect to avoid broken deep links.
import { Redirect } from 'expo-router';
export default function WhoUsesRedirect() {
  return <Redirect href={'/(onboarding)/add-profile' as never} />;
}
