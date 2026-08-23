import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { listOffline, type OfflineEntry } from '../../src/offline';
import type { LibraryCard } from '../../src/api';
import {
  Body,
  Button,
  Caption,
  EmptyState,
  ErrorNotice,
  Loading,
  Screen,
  radius,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * The library.
 *
 * Cover-led, because that is how anyone recognises a book they have read
 * before. Downloaded books are badged, and — importantly — they stay
 * openable when the list itself fails to load, which is what "offline"
 * has to mean in practice.
 */
export default function Library() {
  const { api } = useSession();
  const router = useRouter();
  const palette = usePalette();

  const [stories, setStories] = useState<LibraryCard[] | null>(null);
  const [offline, setOffline] = useState<OfflineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ stories: next }, downloaded] = await Promise.all([api.stories.list(), listOffline()]);
      setStories(next);
      setOffline(downloaded);
      setError(null);
    } catch (caught) {
      // Fall back to whatever is on the device rather than an empty page.
      const downloaded = await listOffline();
      setOffline(downloaded);
      setStories((current) => current ?? []);
      setError(caught instanceof Error ? caught.message : 'We could not load your library.');
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (stories === null) return <Loading label="Opening your library" />;

  const downloadedIds = new Set(offline.map((entry) => entry.storyId));

  return (
    <Screen edges={[]}>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.amber}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={error ? <ErrorNotice message={error} /> : null}
        ListEmptyComponent={
          <EmptyState
            title="Your library is waiting"
            description="Make your first story and it will live here."
            action={<Button label="Create a story" onPress={() => router.push('/(app)/create')} />}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/story/${item.id}`)}
            style={{ flex: 1, gap: spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <View
              style={{
                aspectRatio: 3 / 4,
                borderRadius: radius.card,
                overflow: 'hidden',
                backgroundColor: palette.paperSunken,
                borderWidth: 1,
                borderColor: palette.line,
              }}
            >
              {item.coverUrl ? (
                <Image
                  source={{ uri: item.coverUrl }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>{item.status === 'failed' ? '⚠️' : '✨'}</Text>
                </View>
              )}

              {item.status !== 'ready' && item.status !== 'failed' ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(43,33,25,0.78)',
                    paddingVertical: 6,
                    alignItems: 'center',
                  }}
                >
                  <Text style={[type.caption, { color: '#fff' }]}>Being made…</Text>
                </View>
              ) : null}

              {downloadedIds.has(item.id) ? (
                <View
                  style={{
                    position: 'absolute',
                    top: spacing.sm,
                    right: spacing.sm,
                    backgroundColor: palette.sageSoft,
                    borderRadius: radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={[type.caption, { color: palette.sage }]}>Offline</Text>
                </View>
              ) : null}
            </View>

            <View style={{ gap: 2 }}>
              <Text numberOfLines={2} style={[type.label, { color: palette.ink, fontSize: 15 }]}>
                {item.title}
              </Text>
              <Caption>
                {[item.childDisplayName, item.pageCount > 0 ? `${item.pageCount} pages` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Caption>
            </View>
          </Pressable>
        )}
      />

      {offline.length > 0 && stories.length === 0 ? (
        <View style={{ padding: spacing.md }}>
          <Body>You have {offline.length} book(s) saved on this device.</Body>
        </View>
      ) : null}
    </Screen>
  );
}
