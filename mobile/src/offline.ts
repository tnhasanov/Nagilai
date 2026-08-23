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
 */
const ROOT = 'nagilai-books';
const INDEX_KEY = 'nagilai.offline.index';

export interface OfflineEntry {
  storyId: string;
  title: string;
  coverUri: string | null;
  downloadedAt: string;
  bytes: number;
}

function bookDirectory(storyId: string): Directory {
  return new Directory(Paths.document, ROOT, storyId);
}

/** Offline storage is a native capability; the web target skips it. */
export const offlineSupported = Platform.OS !== 'web';

export async function listOffline(): Promise<OfflineEntry[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineEntry[];
  } catch {
    return [];
  }
}

export async function isDownloaded(storyId: string): Promise<boolean> {
  return (await listOffline()).some((entry) => entry.storyId === storyId);
}

/**
 * Downloads a story for offline reading.
 *
 * `onProgress` reports a 0..1 fraction so the UI can show real movement
 * rather than an indeterminate spinner - a sixteen-page illustrated book
 * is a slow download on a phone.
 */
export async function downloadStory(
  story: ReaderStory,
  onProgress?: (fraction: number) => void,
): Promise<ReaderStory> {
  if (!offlineSupported) return story;

  const directory = bookDirectory(story.id);
  if (!directory.exists) directory.create({ intermediates: true });

  const assets: Array<{ url: string; name: string }> = [];
  if (story.cover?.url) assets.push({ url: story.cover.url, name: 'cover.img' });
  for (const page of story.pages) {
    if (page.illustration?.url) {
      assets.push({ url: page.illustration.url, name: `page-${page.pageNumber}.img` });
    }
  }
  if (story.narration?.url) assets.push({ url: story.narration.url, name: 'narration.audio' });

  const localUris = new Map<string, string>();
  let done = 0;
  let bytes = 0;

  for (const asset of assets) {
    try {
      const file = await File.downloadFileAsync(asset.url, new File(directory, asset.name));
      localUris.set(asset.url, file.uri);
      bytes += file.size ?? 0;
    } catch {
      // One missing picture must not fail the whole download; the reader
      // already copes with a page that has no illustration.
    }
    done += 1;
    onProgress?.(done / Math.max(1, assets.length));
  }

  const offlineStory = rewriteUrls(story, localUris);

  new File(directory, 'story.json').write(JSON.stringify(offlineStory));

  const index = (await listOffline()).filter((entry) => entry.storyId !== story.id);
  index.unshift({
    storyId: story.id,
    title: story.title,
    coverUri: offlineStory.cover?.url ?? null,
    downloadedAt: new Date().toISOString(),
    bytes,
  });
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));

  return offlineStory;
}

export async function readOffline(storyId: string): Promise<ReaderStory | null> {
  if (!offlineSupported) return null;

  try {
    const file = new File(bookDirectory(storyId), 'story.json');
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as ReaderStory;
  } catch {
    return null;
  }
}

export async function removeOffline(storyId: string): Promise<void> {
  if (!offlineSupported) return;

  try {
    const directory = bookDirectory(storyId);
    if (directory.exists) directory.delete();
  } catch {
    // Already gone is the desired end state either way.
  }

  const index = (await listOffline()).filter((entry) => entry.storyId !== storyId);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
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
