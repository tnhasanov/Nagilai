import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { useT } from '../../src/i18n';
import { useNetworkStatus } from '../../src/network';
import { listOffline, type OfflineEntry } from '../../src/offline';
import type { LibraryCard } from '../../src/api';
import {
  Banner,
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
 *
 * When the connection comes back the list refetches itself. A library
 * that stays stale after the train leaves the tunnel, until somebody
 * happens to pull down on it, is the thing that makes an app feel broken.
 */
export default function Library() {
  const { api } = useSession();
  const router = useRouter();
  const palette = usePalette();
  const t = useT();
  const { online, reconnectedAt } = useNetworkStatus();

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
      /* Localised, always. `caught.message` is whatever English the API
         or fetch stack produced, shown verbatim inside a translated
         screen. */
      setError(t('library.loadFailed'));
    }
  }, [api, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Refetch the moment connectivity returns, rather than waiting for the
  // parent to notice and pull down.
  useEffect(() => {
    if (reconnectedAt > 0) void load();
  }, [reconnectedAt, load]);

  if (stories === null) return <Loading label={t('library.opening')} />;

  const downloadedIds = new Set(offline.map((entry) => entry.storyId));

  /*
   * Offline with saved books, the saved books ARE the library. They were
   * downloaded precisely for this moment, and used to be advertised in a
   * non-tappable banner under an empty state that said "make your first
   * story" — while three finished books sat unreachable on the disk.
   * Gated on the fetch actually having failed, so stale downloads never
   * shadow a genuinely empty library.
   */
  const showingOffline = error !== null && stories.length === 0 && offline.length > 0;
  const cards: LibraryCard[] = showingOffline
    ? offline.map((entry) => ({
        id: entry.storyId,
        title: entry.title,
        subtitle: null,
        status: 'ready',
        languageCode: '',
        themeSlug: '',
        childDisplayName: null,
        isFavourite: false,
        createdAt: entry.downloadedAt,
        coverUrl: entry.coverUri,
        pageCount: 0,
        hasNarration: false,
        isShared: false,
      }))
    : stories;

  return (
    <Screen edges={[]}>
      {!online ? <Banner message={t('common.noConnection')} tone="warning" /> : null}

      <FlatList
        data={cards}
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
        ListHeaderComponent={
          error ? (
            <View style={{ gap: spacing.sm }}>
              <ErrorNotice message={error} />
              <Button variant="secondary" label={t('common.retry')} onPress={() => void load()} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          /* Never both: "we could not load your library" directly above
             "your library is waiting — create your first story" is two
             contradictions and one broken Create button. */
          error ? null : (
            <EmptyState
            title={t('library.emptyTitle')}
            description={t('library.emptyDescription')}
            action={
              <Button label={t('library.createFirst')} onPress={() => router.push('/(app)/create')} />
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/story/${item.id}`)}
            style={{ flex: 1, maxWidth: '50%', gap: spacing.sm }}
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

              {item.status !== 'ready' ? (
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
                  <Text style={[type.caption, { color: '#fff' }]}>
                    {item.status === 'failed' ? t('library.failed') : t('library.beingMade')}
                  </Text>
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
                  <Text style={[type.caption, { color: palette.sage }]}>{t('common.offline')}</Text>
                </View>
              ) : null}
            </View>

            <View style={{ gap: 2 }}>
              <Text numberOfLines={2} style={[type.label, { color: palette.ink, fontSize: 15 }]}>
                {item.title}
              </Text>
              <Caption>
                {[
                  item.childDisplayName,
                  item.pageCount > 0 ? t('library.pagesCount', { count: item.pageCount }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Caption>
            </View>
          </Pressable>
        )}
      />


    </Screen>
  );
}
