import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { ApiError, type ReaderPage, type ReaderStory, type StoryProgress } from '../../src/api';
import { formatDuration, useNarration } from '../../src/narration';
import { downloadStory, isDownloaded, offlineSupported, readOffline } from '../../src/offline';
import {
  Body,
  Button,
  Caption,
  Card,
  ErrorNotice,
  Heading,
  Loading,
  Screen,
  Title,
  radius,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * The reader.
 *
 * One route, three states: the waiting room while a book is being made,
 * the book itself, and a failure with a retry. Same URL throughout, so
 * the link a parent taps the moment they press Create keeps working.
 *
 * The native advantages over the web reader are the point of this screen:
 * narration keeps playing with the phone locked, and a downloaded book
 * renders from the filesystem with no connection at all.
 */
export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const router = useRouter();
  const navigation = useNavigation();
  const palette = usePalette();

  const [story, setStory] = useState<ReaderStory | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;

    try {
      const { story: next } = await api.stories.get(id);
      setStory(next);
      setError(null);

      if (next.status !== 'ready') {
        setProgress(await api.stories.progress(id));
      }
    } catch (caught) {
      // No connection? A downloaded copy is a complete answer.
      const local = await readOffline(id);
      if (local) {
        setStory(local);
        setError(null);
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'We could not open this story.');
    }
  }, [api, id]);

  useEffect(() => {
    void load();
    if (id) void isDownloaded(id).then(setDownloaded);
  }, [load, id]);

  useEffect(() => {
    if (story) navigation.setOptions({ title: story.status === 'ready' ? story.title : '' });
  }, [navigation, story]);

  /* Poll while the book is being written and painted (§27). */
  useEffect(() => {
    if (!id || !story || story.status === 'ready' || story.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const next = await api.stories.progress(id);
        setProgress(next);
        if (next.status === 'ready' || next.status === 'failed') {
          clearInterval(timer);
          void load();
        }
      } catch {
        // A dropped poll is not worth surfacing; the next tick retries.
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [api, id, story, load]);

  if (error && !story) {
    return (
      <Screen scroll>
        <ErrorNotice message={error} />
        <Button label="Try again" onPress={() => void load()} />
      </Screen>
    );
  }

  if (!story) return <Loading label="Opening the book" />;

  if (story.status === 'failed') {
    return (
      <Screen scroll>
        <Title>We could not finish this story</Title>
        <Body style={{ marginTop: spacing.sm }}>
          Nothing has been charged for the part that failed. You can try again.
        </Body>
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button
            label="Try again"
            loading={busy === 'retry'}
            onPress={async () => {
              setBusy('retry');
              await api.stories.retry(story.id).catch(() => undefined);
              await load();
              setBusy(null);
            }}
          />
          <Button label="Back to library" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (story.status !== 'ready') {
    return <GenerationProgress progress={progress} />;
  }

  return (
    <Book
      story={story}
      downloaded={downloaded}
      downloading={downloading}
      busy={busy}
      onDownload={async () => {
        setDownloading(0);
        await downloadStory(story, setDownloading);
        setDownloaded(true);
        setDownloading(null);
      }}
      onShare={async () => {
        setBusy('share');
        try {
          const { share } = await api.stories.share(story.id, {
            allowAudio: true,
            allowDownload: false,
            allowIndexing: false,
            expiresInDays: 0,
          });
          if (share.url) {
            await Share.share({ message: `${story.title}\n${share.url}`, url: share.url });
          }
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : 'We could not create a link.');
        } finally {
          setBusy(null);
        }
      }}
      onNarrate={async () => {
        setBusy('narrate');
        try {
          await api.stories.narrate(story.id, {});
          setTimeout(() => void load(), 6000);
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : 'We could not start the narration.');
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

function GenerationProgress({ progress }: { progress: StoryProgress | null }) {
  const palette = usePalette();
  const percent = progress?.percent ?? 5;

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md }}>
        <Text style={{ fontSize: 44 }}>✨</Text>
        <Title>Making your story</Title>
        <Body style={{ textAlign: 'center' }}>{progress?.statusMessage ?? 'Getting ready'}</Body>

        <View
          style={{
            height: 8,
            width: '100%',
            borderRadius: 4,
            backgroundColor: palette.paperSunken,
            overflow: 'hidden',
            marginTop: spacing.md,
          }}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: percent, min: 0, max: 100 }}
        >
          <View
            style={{ height: 8, width: `${Math.max(4, percent)}%`, backgroundColor: palette.amber }}
          />
        </View>

        {progress && progress.totalIllustrations > 0 ? (
          <Caption>
            {progress.readyIllustrations} of {progress.totalIllustrations} pictures painted
          </Caption>
        ) : null}

        <Caption style={{ textAlign: 'center', marginTop: spacing.lg }}>
          This usually takes a minute or two. You can close the app — we will keep going.
        </Caption>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function Book({
  story,
  downloaded,
  downloading,
  busy,
  onDownload,
  onShare,
  onNarrate,
}: {
  story: ReaderStory;
  downloaded: boolean;
  downloading: number | null;
  busy: string | null;
  onDownload: () => void;
  onShare: () => void;
  onNarrate: () => void;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Spread>>(null);
  const [index, setIndex] = useState(0);

  const narration = useNarration(
    story.narration?.status === 'ready' ? story.narration.url : null,
    story.narration?.timings ?? null,
  );

  /* The voice turns the page (§10). */
  useEffect(() => {
    if (narration.currentPage === null) return;
    const target = narration.currentPage; // page 1 is spread index 1
    if (target !== index) {
      listRef.current?.scrollToIndex({ index: target, animated: true });
      setIndex(target);
    }
  }, [narration.currentPage, index]);

  const spreads: Spread[] = [
    { kind: 'cover' },
    ...story.pages.map((page) => ({ kind: 'page' as const, page })),
    { kind: 'end' },
  ];

  return (
    <Screen edges={[]}>
      <FlatList
        ref={listRef}
        data={spreads}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => (item.kind === 'page' ? item.page.id : `${item.kind}-${i}`)}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(event) => {
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={{ width, padding: spacing.md }}>
            {item.kind === 'cover' ? (
              <CoverSpread story={story} />
            ) : item.kind === 'page' ? (
              <PageSpread page={item.page} total={story.pages.length} />
            ) : (
              <EndSpread story={story} />
            )}
          </View>
        )}
      />

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: palette.line,
          padding: spacing.md,
          gap: spacing.sm,
          backgroundColor: palette.paper,
        }}
      >
        {story.narration?.status === 'ready' && narration.isLoaded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable
              onPress={narration.toggle}
              accessibilityRole="button"
              accessibilityLabel={narration.isPlaying ? 'Pause' : 'Play'}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.pill,
                backgroundColor: palette.amber,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20 }}>{narration.isPlaying ? '⏸' : '▶️'}</Text>
            </Pressable>

            <Pressable onPress={narration.restart} accessibilityLabel="Start again">
              <Text style={{ fontSize: 18 }}>↺</Text>
            </Pressable>

            <View style={{ flex: 1, gap: 4 }}>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: palette.paperSunken,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${
                      narration.durationSeconds > 0
                        ? (narration.positionSeconds / narration.durationSeconds) * 100
                        : 0
                    }%`,
                    backgroundColor: palette.amber,
                  }}
                />
              </View>
              <Caption>
                {formatDuration(narration.positionSeconds)} / {formatDuration(narration.durationSeconds)}
              </Caption>
            </View>

            <Pressable
              onPress={() => narration.setRate(narration.rate === 1 ? 1.25 : narration.rate === 1.25 ? 0.75 : 1)}
              accessibilityLabel="Playback speed"
            >
              <Text style={[type.label, { color: palette.inkSoft }]}>{narration.rate}×</Text>
            </Pressable>
          </View>
        ) : (
          <Button
            label={story.narration ? 'Preparing the narration…' : 'Listen'}
            variant="secondary"
            loading={busy === 'narrate' || Boolean(story.narration)}
            disabled={Boolean(story.narration)}
            onPress={onNarrate}
          />
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {offlineSupported ? (
            <View style={{ flex: 1 }}>
              <Button
                label={
                  downloaded
                    ? 'Saved offline'
                    : downloading !== null
                      ? `Saving ${Math.round(downloading * 100)}%`
                      : 'Save offline'
                }
                variant="ghost"
                disabled={downloaded || downloading !== null}
                onPress={onDownload}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Share" variant="ghost" loading={busy === 'share'} onPress={onShare} />
          </View>
        </View>

        <Caption style={{ textAlign: 'center' }}>
          {index === 0
            ? 'Cover'
            : index === spreads.length - 1
              ? 'The End'
              : `Page ${index} of ${story.pages.length}`}
        </Caption>
      </View>
    </Screen>
  );
}

type Spread = { kind: 'cover' } | { kind: 'page'; page: ReaderPage } | { kind: 'end' };

function CoverSpread({ story }: { story: ReaderStory }) {
  const palette = usePalette();

  return (
    <Card style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
      <View style={{ flex: 1, backgroundColor: palette.paperSunken }}>
        {story.cover?.url ? (
          <Image source={{ uri: story.cover.url }} style={{ flex: 1 }} contentFit="cover" transition={200} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>📖</Text>
          </View>
        )}
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
        <Title>{story.title}</Title>
        {story.childDisplayName ? <Caption>For {story.childDisplayName}</Caption> : null}
        {story.dedication ? (
          <Body style={{ marginTop: spacing.sm, fontStyle: 'italic' }}>{story.dedication}</Body>
        ) : null}
      </View>
    </Card>
  );
}

function PageSpread({ page, total }: { page: ReaderPage; total: number }) {
  const palette = usePalette();

  return (
    <Card style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
      {page.illustration?.url ? (
        <Image
          source={{ uri: page.illustration.url }}
          style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: palette.paperSunken }}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center' }}>
        <Text style={[type.story, { color: palette.ink }]}>{page.text}</Text>
        <Caption style={{ textAlign: 'center', marginTop: spacing.lg }}>
          {page.pageNumber} / {total}
        </Caption>
      </View>
    </Card>
  );
}

function EndSpread({ story }: { story: ReaderStory }) {
  const palette = usePalette();

  return (
    <Card style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
      <Title style={{ textAlign: 'center' }}>The End</Title>
      <View style={{ height: 1, width: 48, backgroundColor: palette.amber, alignSelf: 'center' }} />

      {story.educationalTakeaway || story.discussionQuestions.length > 0 ? (
        <View
          style={{
            backgroundColor: palette.paperSunken,
            borderRadius: radius.card,
            padding: spacing.md,
            marginTop: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <Text style={[type.caption, { color: palette.amberDeep, letterSpacing: 1 }]}>
            FOR GROWN-UPS
          </Text>
          {story.educationalTakeaway ? (
            <Text style={[type.body, { color: palette.ink }]}>{story.educationalTakeaway}</Text>
          ) : null}
          {story.discussionQuestions.map((question) => (
            <Body key={question}>· {question}</Body>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
