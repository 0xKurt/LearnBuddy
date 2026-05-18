// Dead code. Signup now lives in welcome.tsx. Redirect there.
import { Redirect } from 'expo-router';
export default function AccountSignupRedirect() {
  return <Redirect href={'/(onboarding)/welcome' as never} />;
}
