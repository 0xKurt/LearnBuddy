// Decides whether to send the user to onboarding or the learner surface.
// Skeleton: always routes to onboarding/welcome. Production checks the
// account row via GET /account and routes accordingly.
import { Redirect } from 'expo-router';

export default function IndexRoute() {
  return <Redirect href="/(onboarding)/welcome" />;
}
