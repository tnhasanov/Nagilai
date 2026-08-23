import { Directory, File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ReaderStory } from './api';

/**
 * Offline books.
 *
 * The other capability that justifies a native app: a downloaded story is
 * readable with no connection at all, which is the difference between "a
 * bedtime story" and "a bedtime story if the wifi reaches the bedroom".
 *
 * How it works: the story JSON and every asset are copied into the app's
 * document directory, and the manifest rewrites each remote URL to a
 * local `file://` path. The reader then renders a downloaded story with
 * no code change - it is the same object with different URLs.
 *
 * Signed URLs expire, which is precisely why the *bytes* are copied
 * rather than the links cached.
 *
 * Three things make this survive contact with a real phone:
 *
 *  - **The index is a claim, the filesystem is the truth.** An entry
 *    whose directory the OS has reclaimed is not a book, so the index is
 *    verified against disk rather than believed.
 *  - **A partial download stays partial, and says so.** A book that lost
 *    three pictures to a dropped connection is still readable and can be
 *    completed later; recording it as complete would mean it never is.
 *  - **Signing out removes the books.** They are one family's children's
 *    stories sitting in a directory on a device somebody else may now be
 *    holding.
 */
const ROOT = 'nagilai-books';
const INDEX_KEY = 'nagilai.offline.index';
const MANIFEST = 'story.json';

export interface OfflineEntry {
  storyId: string;
  title: string;
  coverUri: string | null;
  downloadedAt: string;
  bytes: number;
  /** Assets that were expected. */
  assetsExpected: number;
  /** Assets actually on disk. Fewer means the download was interrupted. */
  assetsStored: number;
}

/** True when every asset the book expected is present. */
export function isComplete(entry: OfflineEntry): boolean {
  return entry.assetsStored >= entry.assetsExpected;
}

function bookDirectory(storyId: string): Directory {
  return new Directory(Paths.document, ROOT, storyId);
}

/** Offline storage is a native capability; the web target skips it. */
export const offlineSupported = Platform.OS !== 'web';

async function readIndex(): Promise<OfflineEntry[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY).catch(() => null);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Entries written by an older build lack the asset counts. Treating
    // them as complete is right: they were complete by the rules that
    // existed when they were written.
    return parsed.map((entry: Partial<OfflineEntry>) => ({
      storyId: String(entry.storyId ?? ''),
      title: String(entry.title ?? ''),
      coverUri: entry.coverUri ?? null,
      downloadedAt: String(entry.downloadedAt ?? new Date(0).toISOString()),
      bytes: Number(entry.bytes ?? 0),
      assetsExpected: Number(entry.assetsExpected ?? 0),
      assetsStored: Number(entry.assetsStored ?? entry.assetsExpected ?? 0),
    }));
  } catch {
    return [];
  }
}

async function writeIndex(entries: OfflineEntry[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries)).catch(() => undefined);
}

/**
 * The books actually on this device.
 *
 * Verified against the filesystem, not just read from the index. iOS and
 * Android both reclaim an app's cache and document directories under
 * storage pressure, and a library that offers to open a book whose bytes
 * are gone is worse than one that never claimed to have it.
 */
export async function listOffline(): Promise<OfflineEntry[]> {
  if (!offlineSupported) return [];

  const claimed = await readIndex();
  const verified: OfflineEntry[] = [];
  let dropped = false;

  for (const entry of claimed) {
    if (!entry.storyId) {
      dropped = true;
      continue;
    }
    try {
      if (new File(bookDirectory(entry.storyId), MANIFEST).exists) {
        verified.push(entry);
      } else {
        dropped = true;
      }
    } catch {
      dropped = true;
    }
  }

  if (dropped) await writeIndex(verified);
  return verified;
}

/** How many bytes were freed by entries the filesystem had already lost. */
export async function reconcile(): Promise<{ removed: number; bytesFreed: number }> {
  if (!offlineSupported) return { removed: 0, bytesFreed: 0 };

  const claimed = await readIndex();
  const verified = await listOffline();
  const keptIds = new Set(verified.map((entry) => entry.storyId));
  const lost = claimed.filter((entry) => !keptIds.has(entry.storyId));

  return {
    removed: lost.length,
    bytesFreed: lost.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

export async function offlineEntry(storyId: string): Promise<OfflineEntry | null> {
  return (await listOffline()).find((entry) => entry.storyId === storyId) ?? null;
}

export async function isDownloaded(storyId: string): Promise<boolean> {
  return (await offlineEntry(storyId)) !== null;
}

interface PlannedAsset {
  url: string;
  name: string;
}

function planAssets(story: ReaderStory): PlannedAsset[] {
  const assets: PlannedAsset[] = [];
  if (story.cover?.url) assets.push({ url: story.cover.url, name: 'cover.img' });
  for (const page of story.pages) {
    if (page.illustration?.url) {
      assets.push({ url: page.illustration.url, name: `page-${page.pageNumber}.img` });
    }
  }
  if (story.narration?.url) assets.push({ url: story.narration.url, name: 'narration.audio' });
  return assets;
}

export interface DownloadResult {
  story: ReaderStory;
  entry: OfflineEntry;
}

/**
 * Downloads a story for offline reading.
 *
 * `onProgress` reports a 0..1 fraction so the UI can show real movement
 * rather than an indeterminate spinner - a sixteen-page illustrated book
 * is a slow download on a phone.
 *
 * Resumable in the sense that matters: an asset already on disk is not
 * fetched again, so pressing "save" a second time after a dropped
 * connection completes the book rather than starting over.
 */
export async function downloadStory(
  story: ReaderStory,
  onProgress?: (fraction: number) => void,
): Promise<DownloadResult> {
  const empty: OfflineEntry = {
    storyId: story.id,
    title: story.title,
    coverUri: null,
    downloadedAt: new Date().toISOString(),
    bytes: 0,
    assetsExpected: 0,
    assetsStored: 0,
  };

  if (!offlineSupported) return { story, entry: empty };

  const directory = bookDirectory(story.id);
  if (!directory.exists) directory.create({ intermediates: true });

  const assets = planAssets(story);
  const localUris = new Map<string, string>();
  let done = 0;
  let stored = 0;
  let bytes = 0;

  for (const asset of assets) {
    const target = new File(directory, asset.name);

    try {
      if (target.exists && (target.size ?? 0) > 0) {
        // Already here from an interrupted attempt: keep the bytes.
        localUris.set(asset.url, target.uri);
        bytes += target.size ?? 0;
        stored += 1;
      } else {
        const file = await File.downloadFileAsync(asset.url, target);
        localUris.set(asset.url, file.uri);
        bytes += file.size ?? 0;
        stored += 1;
      }
    } catch {
      // One missing picture must not fail the whole download; the reader
      // already copes with a page that has no illustration, and the entry
      // records that this book is incomplete so it can be finished later.
    }

    done += 1;
    onProgress?.(done / Math.max(1, assets.length));
  }

  const offlineStory = rewriteUrls(story, localUris);

  try {
    new File(directory, MANIFEST).write(JSON.stringify(offlineStory));
  } catch {
    // Without a manifest there is no book, so do not record one.
    return { story, entry: empty };
  }

  const entry: OfflineEntry = {
    storyId: story.id,
    title: story.title,
    coverUri: offlineStory.cover?.url ?? null,
    downloadedAt: new Date().toISOString(),
    bytes,
    assetsExpected: assets.length,
    assetsStored: stored,
  };

  const index = (await readIndex()).filter((existing) => existing.storyId !== story.id);
  index.unshift(entry);
  await writeIndex(index);

  return { story: offlineStory, entry };
}

export async function readOffline(storyId: string): Promise<ReaderStory | null> {
  if (!offlineSupported) return null;

  try {
    const file = new File(bookDirectory(storyId), MANIFEST);
    if (!file.exists) return null;

    const parsed: unknown = JSON.parse(file.textSync());
    return isReaderStory(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A manifest written by an older build, or truncated by a crash mid-write,
 * must not reach the reader as a half-object. This is the cheapest check
 * that catches both.
 */
function isReaderStory(value: unknown): value is ReaderStory {
  if (!value || typeof value !== 'object') return false;
  const story = value as Partial<ReaderStory>;
  return typeof story.id === 'string' && Array.isArray(story.pages);
}

export async function removeOffline(storyId: string): Promise<void> {
  if (!offlineSupported) return;

  try {
    const directory = bookDirectory(storyId);
    if (directory.exists) directory.delete();
  } catch {
    // Already gone is the desired end state either way.
  }

  await writeIndex((await readIndex()).filter((entry) => entry.storyId !== storyId));
}

/**
 * Removes every downloaded book.
 *
 * Called on sign-out. These are one family's children's stories, sitting
 * unencrypted in a directory; leaving them for whoever signs in next on a
 * shared family tablet is not a defensible default.
 */
export async function clearOffline(): Promise<void> {
  if (!offlineSupported) return;

  try {
    const root = new Directory(Paths.document, ROOT);
    if (root.exists) root.delete();
  } catch {
    // Fall through: the index is cleared regardless, so nothing is
    // offered that cannot be opened.
  }

  await AsyncStorage.removeItem(INDEX_KEY).catch(() => undefined);
}

/** Swaps every remote asset URL for its downloaded copy. */
function rewriteUrls(story: ReaderStory, localUris: Map<string, string>): ReaderStory {
  const swap = (url: string | null | undefined): string | null =>
    url ? (localUris.get(url) ?? null) : null;

  return {
    ...story,
    cover: story.cover ? { ...story.cover, url: swap(story.cover.url) } : null,
    pages: story.pages.map((page) => ({
      ...page,
      illustration: page.illustration
        ? { ...page.illustration, url: swap(page.illustration.url) }
        : null,
    })),
    narration: story.narration ? { ...story.narration, url: swap(story.narration.url) } : null,
  };
}
