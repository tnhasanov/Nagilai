import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { HeroBook } from '../../src/components/hero-book';
import { useSession } from '../../src/session';
import { useI18n } from '../../src/i18n';
import { useNetworkStatus } from '../../src/network';
import { ApiError, type ReaderPage, type ReaderStory, type StoryProgress } from '../../src/api';
import { formatDuration, useNarration } from '../../src/narration';
import {
  downloadStory,
  isComplete,
  offlineEntry,
  offlineSupported,
  readOffline,
  type OfflineEntry,
} from '../../src/offline';
import { hasAskedBefore, markAsked, permissionState, registerForPush } from '../../src/push';
import {
  Banner,
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
 * the link a parent taps the moment they press Create keeps working - and
 * so does the deep link a notification carries.
 *
 * The native advantages over the web reader are the point of this screen:
 * narration keeps playing with the phone locked and appears on the lock
 * screen, and a downloaded book renders from the filesystem with no
 * connection at all.
 */
export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useI18n();
  const { online, reconnectedAt } = useNetworkStatus();

  const [story, setStory] = useState<ReaderStory | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<OfflineEntry | null>(null);
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
      setError(caught instanceof ApiError ? caught.message : t('reader.openFailed'));
    }
  }, [api, id, t]);

  useEffect(() => {
    void load();
    if (id) void offlineEntry(id).then(setSaved);
  }, [load, id]);

  // A book that could not be opened offline becomes openable the moment
  // the connection returns.
  useEffect(() => {
    if (reconnectedAt > 0) void load();
  }, [reconnectedAt, load]);

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

  /*
   * And poll again while narration is being recorded. The generation
   * poller above stops the moment the book is ready, but requesting
   * audio starts a second wait it knows nothing about — this used to be
   * a single reload six seconds after the request, which for a ten-page
   * reading is far too early, so "Preparing the narration" span forever.
   */
  useEffect(() => {
    const narration = story?.narration;
    if (
      !story ||
      story.status !== 'ready' ||
      !narration ||
      narration.status === 'ready' ||
      narration.status === 'failed'
    ) {
      return;
    }
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [story, load]);

  if (error && !story) {
    return (
      <Screen scroll>
        {!online ? <Banner message={t('common.noConnection')} tone="warning" /> : null}
        <ErrorNotice message={error} />
        <Button label={t('common.retry')} onPress={() => void load()} />
      </Screen>
    );
  }

  if (!story) return <Loading label={t('reader.opening')} />;

  if (story.status === 'failed') {
    return (
      <Screen scroll>
        <Title>{t('reader.failedTitle')}</Title>
        <Body style={{ marginTop: spacing.sm }}>{t('reader.failedBody')}</Body>
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button
            label={t('common.retry')}
            loading={busy === 'retry'}
            onPress={async () => {
              setBusy('retry');
              await api.stories.retry(story.id).catch(() => undefined);
              await load();
              setBusy(null);
            }}
          />
          <Button
            label={t('reader.backToLibrary')}
            variant="ghost"
            onPress={() => router.back()}
          />
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
      online={online}
      saved={saved}
      downloading={downloading}
      busy={busy}
      error={error}
      onDownload={async () => {
        setDownloading(0);
        const { entry } = await downloadStory(story, setDownloading);
        setSaved(entry);
        setDownloading(null);
      }}
      onShare={async () => {
        setBusy('share');
        setError(null);
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
          setError(caught instanceof ApiError ? caught.message : t('reader.shareFailed'));
        } finally {
          setBusy(null);
        }
      }}
      onNarrate={async () => {
        setBusy('narrate');
        setError(null);
        try {
          await api.stories.narrate(story.id, {});
          // The poller below takes it from here; this immediate reload
          // just flips the button to "preparing" without a 6s guess.
          await load();
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : t('reader.narrateFailed'));
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

/**
 * The waiting room.
 *
 * Also the right moment to offer notifications: a parent is looking at a
 * progress bar and has just been told this takes a minute or two, so
 * "shall we tell you when it is done" answers a question they are already
 * asking. Offering it at first launch instead would spend iOS's single
 * permission prompt on a stranger.
 */
function GenerationProgress({ progress }: { progress: StoryProgress | null }) {
  const palette = usePalette();
  const { t, locale } = useI18n();
  const { api, notifications, setNotifications } = useSession();

  const [offer, setOffer] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const percent = progress?.percent ?? 5;
  const stageKey = STAGE_KEYS[(progress?.status ?? '') as keyof typeof STAGE_KEYS];

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Three gates, all of which must pass before a prompt is worth it:
      // the server can actually deliver, the OS has not already decided,
      // and we have not asked before.
      if (!notifications?.available) return;

      const [state, asked] = await Promise.all([permissionState(), hasAskedBefore()]);
      if (cancelled) return;

      if (state === 'granted') setEnabled(true);
      else if (state === 'undetermined' && !asked) setOffer(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [notifications?.available]);

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', paddingTop: spacing.lg, gap: spacing.md }}>
        {/* The book being made, rather than a 44px sparkle emoji. This is
            the longest wait in the product and the moment of most
            anticipation; it should show the thing that is coming. */}
        <HeroBook />
        <Title>{t('reader.makingTitle')}</Title>
        <Body style={{ textAlign: 'center' }}>
          {/*
            `statusMessage` is written into the database by the worker, in
            English, and rendering it here put an English sentence in the
            middle of an otherwise translated screen. The status itself is
            the fact worth showing, and the dictionary has a phrase for
            each one.
          */}
          {stageKey ? t(stageKey) : t('reader.makingDefault')}
        </Body>

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
          <AnimatedProgressBar percent={percent} colour={palette.amber} />
        </View>

        {progress && progress.totalIllustrations > 0 ? (
          <Caption>
            {t('reader.picturesPainted', {
              ready: progress.readyIllustrations,
              total: progress.totalIllustrations,
            })}
          </Caption>
        ) : null}

        {offer ? (
          <Card style={{ gap: spacing.sm, marginTop: spacing.lg, width: '100%' }}>
            <Heading>{t('notifications.permissionTitle')}</Heading>
            <Body>{t('notifications.permissionBody')}</Body>
            <Button
              label={t('notifications.allow')}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                await markAsked();
                const result = await registerForPush(api, locale);
                if (result.status === 'registered') {
                  setEnabled(true);
                  const { notifications: next } = await api.devices
                    .get()
                    .catch(() => ({ notifications: null }));
                  if (next) setNotifications(next);
                }
                setOffer(false);
                setBusy(false);
              }}
            />
            <Button
              label={t('notifications.notNow')}
              variant="ghost"
              onPress={async () => {
                await markAsked();
                setOffer(false);
              }}
            />
          </Card>
        ) : null}

        <Caption style={{ textAlign: 'center', marginTop: spacing.lg }}>
          {enabled ? t('reader.makingFootnoteWithPush') : t('reader.makingFootnote')}
        </Caption>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function Book({
  story,
  online,
  saved,
  downloading,
  busy,
  onDownload,
  onShare,
  onNarrate,
  error,
}: {
  story: ReaderStory;
  online: boolean;
  saved: OfflineEntry | null;
  downloading: number | null;
  busy: string | null;
  onDownload: () => void;
  onShare: () => void;
  onNarrate: () => void;
  /** A share or narration failure from the parent; rendered by the footer. */
  error: string | null;
}) {
  const palette = usePalette();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Spread>>(null);
  const [index, setIndex] = useState(0);
  const lastVoicePage = useRef<number | null>(null);

  const narration = useNarration(
    story.narration?.status === 'ready' ? story.narration.url : null,
    story.narration?.timings ?? null,
    {
      title: story.title,
      subtitle: story.childDisplayName
        ? t('reader.forChild', { name: story.childDisplayName })
        : t('common.appName'),
      artworkUrl: story.cover?.url ?? null,
    },
  );

  /*
   * The voice turns the page (§10) — but only when it reaches a NEW one.
   * With `index` in the dependencies, a parent flipping ahead to look at
   * a picture was snapped straight back to the narrated page on the next
   * render. Remembering the last page the voice itself turned to means a
   * manual swipe is left alone until the reading genuinely moves on.
   */
  useEffect(() => {
    if (narration.currentPage === null || narration.currentPage === lastVoicePage.current) return;
    lastVoicePage.current = narration.currentPage;
    listRef.current?.scrollToIndex({ index: narration.currentPage, animated: true });
    setIndex(narration.currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.currentPage]);

  const narrationFailed = story.narration?.status === 'failed';
  const narrationPending = story.narration != null && story.narration.status !== 'ready' && !narrationFailed;

  const spreads: Spread[] = [
    { kind: 'cover' },
    ...story.pages.map((page) => ({ kind: 'page' as const, page })),
    { kind: 'end' },
  ];

  const missingAssets = saved ? saved.assetsExpected - saved.assetsStored : 0;

  const downloadLabel =
    downloading !== null
      ? t('reader.savingPercent', { percent: Math.round(downloading * 100) })
      : saved && isComplete(saved)
        ? t('reader.savedOffline')
        : saved
          ? t('reader.saveIncomplete', { count: missingAssets })
          : t('reader.saveOffline');

  return (
    <Screen edges={[]}>
      {!online ? <Banner message={t('common.noConnection')} tone="warning" /> : null}

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
        {/* Share and narration failures used to be swallowed: the
            parent set state that nothing rendered once the book was
            open. */}
        {error ? <ErrorNotice message={error} /> : null}
        {narration.error ? (
          <Button label={t('common.retry')} variant="secondary" onPress={narration.reload} />
        ) : story.narration?.status === 'ready' && narration.isLoaded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable
              onPress={narration.toggle}
              accessibilityRole="button"
              accessibilityLabel={narration.isPlaying ? t('reader.pause') : t('reader.play')}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.pill,
                backgroundColor: palette.amber,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20 }}>
                {narration.isBuffering ? '…' : narration.isPlaying ? '⏸' : '▶️'}
              </Text>
            </Pressable>

            <Pressable
              onPress={narration.restart}
              accessibilityRole="button"
              accessibilityLabel={t('reader.startAgain')}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
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
                {formatDuration(narration.positionSeconds)} /{' '}
                {formatDuration(narration.durationSeconds)}
              </Caption>
            </View>

            <Pressable
              onPress={() =>
                narration.setRate(
                  narration.rate === 1 ? 1.25 : narration.rate === 1.25 ? 0.75 : 1,
                )
              }
              accessibilityRole="button"
              accessibilityLabel={t('reader.playbackSpeed')}
              accessibilityValue={{ text: `${narration.rate}\u00d7` }}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={[type.label, { color: palette.inkSoft }]}>{narration.rate}×</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* A failed recording used to be indistinguishable from one
                still being made: `Boolean(story.narration)` kept the
                button disabled at "Preparing…" with a spinner, forever.
                Failure says so, and Listen comes back as the retry. */}
            {narrationFailed ? <ErrorNotice message={t('reader.narrateFailed')} /> : null}
            <Button
              label={narrationPending ? t('reader.preparingNarration') : t('reader.listen')}
              variant="secondary"
              loading={busy === 'narrate' || narrationPending}
              disabled={narrationPending || !online}
              onPress={onNarrate}
            />
          </>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {offlineSupported ? (
            <View style={{ flex: 1 }}>
              <Button
                label={downloadLabel}
                variant="ghost"
                // A complete download needs nothing; an incomplete one is
                // worth pressing again, which is what finishes it.
                disabled={(saved !== null && isComplete(saved)) || downloading !== null || !online}
                onPress={onDownload}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button
              label={t('reader.share')}
              variant="ghost"
              loading={busy === 'share'}
              disabled={!online}
              onPress={onShare}
            />
          </View>
        </View>

        {saved && !isComplete(saved) ? (
          <Caption style={{ textAlign: 'center' }}>{t('reader.saveIncompleteHint')}</Caption>
        ) : null}

        <Caption style={{ textAlign: 'center' }}>
          {index === 0
            ? t('reader.cover')
            : index === spreads.length - 1
              ? t('reader.theEnd')
              : t('reader.pageOf', { page: index, total: story.pages.length })}
        </Caption>
      </View>
    </Screen>
  );
}

type Spread = { kind: 'cover' } | { kind: 'page'; page: ReaderPage } | { kind: 'end' };

function CoverSpread({ story }: { story: ReaderStory }) {
  const palette = usePalette();
  const { t } = useI18n();

  return (
    <Card style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
      <View style={{ flex: 1, backgroundColor: palette.paperSunken }}>
        {story.cover?.url ? (
          <Image
            source={{ uri: story.cover.url }}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>📖</Text>
          </View>
        )}
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
        <Title>{story.title}</Title>
        {story.childDisplayName ? (
          <Caption>{t('reader.forChild', { name: story.childDisplayName })}</Caption>
        ) : null}
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

      {/* Vertical scroll inside the horizontal pager — orthogonal
          directions, so no gesture conflict. A long page on a small
          phone used to simply clip: the story could not be read. The
          scroll indicator is deliberately left on, as the only cue that
          more text exists below. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, justifyContent: 'center' }}
      >
        <Text style={[type.story, { color: palette.ink }]}>{page.text}</Text>
        <Caption style={{ textAlign: 'center', marginTop: spacing.lg }}>
          {page.pageNumber} / {total}
        </Caption>
      </ScrollView>
    </Card>
  );
}

function EndSpread({ story }: { story: ReaderStory }) {
  const palette = usePalette();
  const { t } = useI18n();

  return (
    <Card style={{ flex: 1, padding: 0 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.md }}
      >
      <Title style={{ textAlign: 'center' }}>{t('reader.theEnd')}</Title>
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
            {t('reader.forGrownUps')}
          </Text>
          {story.educationalTakeaway ? (
            <Text style={[type.body, { color: palette.ink }]}>{story.educationalTakeaway}</Text>
          ) : null}
          {story.discussionQuestions.map((question) => (
            <Body key={question}>· {question}</Body>
          ))}
        </View>
      ) : null}
      </ScrollView>
    </Card>
  );
}

/**
 * Story status → the dictionary key that describes it.
 *
 * `as const` so the values stay literal and `t()` still type-checks the
 * key against the dictionary.
 */
const STAGE_KEYS = {
  generating_text: 'reader.stageWriting',
  text_ready: 'reader.stageAlmost',
  generating_images: 'reader.stagePainting',
  images_ready: 'reader.stagePainting',
  generating_audio: 'reader.stageRecording',
} as const;

/**
 * The filled part of the progress bar, easing to each new value.
 *
 * Progress arrives in jumps as the worker finishes whole jobs, and a bar
 * that teleports from 30% to 95% reads as a glitch rather than as
 * progress. Six hundred milliseconds of easing turns the same numbers
 * into something that looks like work being done.
 */
function AnimatedProgressBar({ percent, colour }: { percent: number; colour: string }) {
  const width = useRef(new Animated.Value(Math.max(4, percent))).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(4, percent),
      duration: 600,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      /* A percentage width is a layout property, so this one cannot go
         to the native driver. */
      useNativeDriver: false,
    }).start();
  }, [percent, width]);

  return (
    <Animated.View
      style={{
        height: 8,
        backgroundColor: colour,
        width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
      }}
    />
  );
}
