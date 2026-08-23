import { Redirect } from 'expo-router';
import { useSession } from '../src/session';
import { Loading } from '../src/components/ui';

/**
 * The entry point: send the parent to their library or to sign-in.
 *
 * A route rather than logic in the layout, so deep links land correctly
 * when the app is opened cold from a notification.
 */
export default function Index() {
  const { session, loading } = useSession();

  if (loading) return <Loading />;
  return <Redirect href={session ? '/(app)/library' : '/(auth)/sign-in'} />;
}
