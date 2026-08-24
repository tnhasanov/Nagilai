import { useLocalSearchParams } from 'expo-router';
import { ChildFormScreen } from '../../src/components/child-form-screen';

/**
 * Edit a child.
 *
 * This route did not exist: the children list rendered cards with
 * `accessibilityRole="button"` and no `onPress`, so a typo in a child's
 * name — or a new interest, which is the field that shapes every story —
 * could only ever be fixed on the website.
 */
export default function EditChild() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChildFormScreen childId={id} />;
}
