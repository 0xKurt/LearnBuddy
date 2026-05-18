// Removed: minor-profile consent flow eliminated. All users go through add-profile.
import { Redirect } from 'expo-router';
export default function ProfileMinorConsentRedirect() {
  return <Redirect href={'/(onboarding)/add-profile' as never} />;
}
