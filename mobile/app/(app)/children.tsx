import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import type { ChildProfile } from '../../src/api';
import {
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  ErrorNotice,
  Heading,
  Loading,
  Screen,
  radius,
  spacing,
  usePalette,
} from '../../src/components/ui';

/**
 * Child profiles (§3).
 *
 * Entered once so no story generation ever asks for the same details
 * again.
 */
export default function Children() {
  const { api } = useSession();
  const router = useRouter();
  const palette = usePalette();

  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { children: next } = await api.children.list();
      setChildren(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not load your children.');
      setChildren([]);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (children === null) return <Loading />;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {error ? <ErrorNotice message={error} /> : null}

        {children.length === 0 ? (
          <EmptyState
            title="No child profiles yet"
            description="Add your first child and we will personalise every story around them."
            action={<Button label="Add a child" onPress={() => router.push('/child/new')} />}
          />
        ) : (
          <>
            {children.map((child) => (
              <Pressable key={child.id} accessibilityRole="button">
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: radius.pill,
                      backgroundColor: child.avatarColor ?? palette.plum,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
                      {(child.nickname ?? child.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Heading>{child.nickname ?? child.name}</Heading>
                    <Caption>
                      {[
                        child.ageYears !== null ? `${child.ageYears} years old` : null,
                        child.preferredLanguage,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Caption>
                    {child.interests.length > 0 ? (
                      <Caption numberOfLines={1}>{child.interests.slice(0, 4).join(' · ')}</Caption>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}

            <Button label="Add another child" variant="secondary" onPress={() => router.push('/child/new')} />
          </>
        )}

        <Body style={{ textAlign: 'center', marginTop: spacing.md }}>
          These details are never public and are never used to train anything.
        </Body>
      </ScrollView>
    </Screen>
  );
}
