import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { useT } from '../../src/i18n';
import { LOCALE_NAMES, isLocale } from '../../src/i18n/locales';
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
  const t = useT();

  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { children: next } = await api.children.list();
      setChildren(next);
      setError(null);
    } catch (caught) {
      /* Localised, and the previous list survives a refetch failure —
         `setChildren([])` was wiping loaded profiles on a dropped
         connection. */
      setError(t('children.loadFailed'));
      setChildren((current) => current ?? []);
    }
  }, [api, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (children === null) return <Loading />;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {error ? (
          <View style={{ gap: spacing.sm }}>
            <ErrorNotice message={error} />
            <Button variant="secondary" label={t('common.retry')} onPress={() => void load()} />
          </View>
        ) : null}

        {/* Never under an error: "no child profiles yet" beneath "we
            could not load your children" is a contradiction. */}
        {children.length === 0 && !error ? (
          <EmptyState
            title={t('children.emptyTitle')}
            description={t('children.emptyDescription')}
            action={<Button label={t('children.add')} onPress={() => router.push('/child/new')} />}
          />
        ) : (
          <>
            {children.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={t('children.editLabel', { name: child.nickname ?? child.name })}
                onPress={() => router.push(`/child/${child.id}`)}
              >
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
                        child.ageYears !== null
                          ? t('children.yearsOld', { count: child.ageYears })
                          : null,
                        isLocale(child.preferredLanguage)
                          ? LOCALE_NAMES[child.preferredLanguage]
                          : child.preferredLanguage,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Caption>
                    {summarise(child).length > 0 ? (
                      <Caption numberOfLines={1}>{summarise(child).join(' · ')}</Caption>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}

            <Button
              label={t('children.addAnother')}
              variant="secondary"
              onPress={() => router.push('/child/new')}
            />
          </>
        )}

        <Body style={{ textAlign: 'center', marginTop: spacing.md }}>
          {t('children.privacyNote')}
        </Body>
      </ScrollView>
    </Screen>
  );
}

/**
 * A one-line flavour of who this child is.
 *
 * Draws from every list field rather than only `interests`, so a profile
 * whose personality and learning interests are filled in but whose
 * interests are not still reads as a person rather than as blank space.
 */
function summarise(child: ChildProfile): string[] {
  return [
    ...child.interests,
    ...child.favouriteAnimals,
    ...child.favouriteActivities,
    ...child.personalityTraits,
  ].slice(0, 4);
}
