import Constants from 'expo-constants';

/**
 * The typed client for `/api/v1`.
 *
 * One place that knows how to talk to the server, so a screen never
 * builds a URL or a header by hand. Three things it guarantees:
 *
 *  - the bearer token is attached to every authenticated call;
 *  - a non-2xx response becomes a typed `ApiError` carrying the
 *    server's parent-facing message, never a raw status code;
 *  - a request that hangs is aborted rather than leaving a spinner on
 *    screen forever on a bad connection, which is the normal case on a
 *    phone.
 */

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when signing in again is the fix. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True when the parent has run out of credits. */
  get isPaymentRequired(): boolean {
    return this.status === 402;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Honour a caller's own cancellation as well as the timeout.
  options.signal?.addEventListener('abort', () => controller.abort());

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });

    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const envelope = payload as
        | { error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } } }
        | null;

      throw new ApiError(
        envelope?.error?.code ?? 'unknown',
        envelope?.error?.message ?? 'Something went wrong. Please try again.',
        response.status,
        envelope?.error?.details?.fields,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('timeout', 'That took too long. Check your connection and try again.', 0);
    }
    throw new ApiError('offline', 'We could not reach Nagilai. Check your connection.', 0);
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                     */
/* ------------------------------------------------------------------ */

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  uiLocale: string;
  creditBalance: number;
  isStaff: boolean;
  createdAt: string;
}

export interface RegisteredDevice {
  id: string;
  platform: string;
  deviceName: string | null;
  locale: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  storyReady: boolean;
  quietFromMinute: number | null;
  quietToMinute: number | null;
  timezone: string | null;
  /**
   * Whether the server can deliver a push at all. The app asks before
   * prompting, because iOS gives an app exactly one permission prompt and
   * spending it on a feature that cannot yet deliver wastes it.
   */
  available: boolean;
  /** True only when a real push transport is configured server-side. */
  providerLive: boolean;
  devices: RegisteredDevice[];
}

export interface ChildProfile {
  id: string;
  name: string;
  nickname: string | null;
  ageYears: number | null;
  gender: string | null;
  preferredLanguage: string;
  interests: string[];
  favouriteAnimals: string[];
  favouriteActivities: string[];
  favouriteCharacters: string[];
  personalityTraits: string[];
  learningInterests: string[];
  parentNotes: string | null;
  appearanceDescription: string | null;
  avatarColor: string | null;
  createdAt: string;
}

export interface CatalogueOption {
  slug: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  accentColor?: string | null;
  isPremium?: boolean;
  category?: string;
}

export interface Catalogue {
  locale: string;
  languages: Array<{ code: string; nameNative: string; nameEn: string; flag: string | null }>;
  themes: CatalogueOption[];
  objectives: CatalogueOption[];
  styles: CatalogueOption[];
  voices: CatalogueOption[];
  credits: { storyText: number; storyIllustration: number; storyNarration: number };
  features: Record<string, boolean>;
  lengths: Record<'short' | 'medium' | 'long', { pages: number }>;
}

export interface LibraryCard {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  languageCode: string;
  themeSlug: string;
  childDisplayName: string | null;
  isFavourite: boolean;
  createdAt: string;
  coverUrl: string | null;
  pageCount: number;
  hasNarration: boolean;
  isShared: boolean;
}

export interface ReaderPage {
  id: string;
  pageNumber: number;
  text: string;
  layout: string;
  illustration: { id: string; url: string | null; width: number | null; height: number | null; status: string } | null;
}

export interface ReaderStory {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  dedication: string | null;
  languageCode: string;
  themeSlug: string;
  status: string;
  statusMessage: string | null;
  childDisplayName: string | null;
  educationalTakeaway: string | null;
  discussionQuestions: string[];
  isFavourite: boolean;
  createdAt: string;
  versionId: string;
  cover: { id: string; url: string | null } | null;
  pages: ReaderPage[];
  narration: {
    id: string;
    url: string | null;
    durationSeconds: number | null;
    voiceSlug: string;
    status: string;
    timings: Array<{ pageNumber: number; startSeconds: number; endSeconds: number }> | null;
  } | null;
}

export interface StoryProgress {
  status: string;
  statusMessage: string | null;
  failureReason: string | null;
  percent: number;
  totalIllustrations: number;
  readyIllustrations: number;
}

/**
 * Everything a child profile can carry.
 *
 * Deliberately the full set the API accepts rather than a convenient
 * subset: a profile created on the phone should produce exactly as
 * personalised a story as one created on the website, and a missing
 * `personalityTraits` is a blander book, not a validation error anyone
 * would notice.
 */
export interface ChildInput {
  name: string;
  nickname?: string;
  ageYears?: number | null;
  gender?: string;
  preferredLanguage: string;
  interests?: string;
  favouriteAnimals?: string;
  favouriteActivities?: string;
  favouriteCharacters?: string;
  personalityTraits?: string;
  learningInterests?: string;
  avatarColor?: string;
  appearanceDescription?: string;
  parentNotes?: string;
}

export interface CreateStoryInput {
  childId: string;
  languageCode: string;
  themeSlug: string;
  objectiveSlug?: string | null;
  illustrationStyleSlug?: string | null;
  length: 'short' | 'medium' | 'long';
  customInstructions?: string;
  dedication?: string;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export function createApi(token: string | null) {
  const call = <T>(path: string, options: RequestOptions = {}) =>
    apiRequest<T>(path, { ...options, token });

  return {
    me: () =>
      call<{
        ready: boolean;
        profile: Profile | null;
        notifications: NotificationPreferences;
      }>('/api/v1/me'),

    /**
     * Updates the parent's own profile.
     *
     * `uiLocale` here is the *interface* language. It never changes an
     * existing story, and it is not the default language for new ones --
     * that comes from the child's profile.
     */
    updateProfile: (input: { displayName?: string; uiLocale: string; marketingOptIn?: boolean }) =>
      call<{ updated: boolean; uiLocale: string }>('/api/v1/me', { method: 'PATCH', body: input }),

    devices: {
      get: () => call<{ notifications: NotificationPreferences }>('/api/v1/devices'),
      register: (input: {
        token: string;
        platform: 'ios' | 'android' | 'web';
        deviceId?: string | null;
        deviceName?: string | null;
        appVersion?: string | null;
        locale?: string | null;
      }) => call<{ registered: boolean }>('/api/v1/devices', { method: 'POST', body: input }),
      preferences: (input: {
        pushEnabled?: boolean;
        storyReady?: boolean;
        quietFromMinute?: number | null;
        quietToMinute?: number | null;
        timezone?: string | null;
      }) =>
        call<{ notifications: NotificationPreferences }>('/api/v1/devices', {
          method: 'PATCH',
          body: input,
        }),
      unregister: (token: string) =>
        call<{ removed: boolean }>('/api/v1/devices', { method: 'DELETE', body: { token } }),
    },

    catalogue: (locale: string, age?: number | null) =>
      call<Catalogue>(
        `/api/v1/catalogue?locale=${encodeURIComponent(locale)}` +
          (age != null ? `&age=${age}` : ''),
      ),

    children: {
      list: () => call<{ children: ChildProfile[] }>('/api/v1/children'),
      create: (input: ChildInput) =>
        call<{ child: ChildProfile }>('/api/v1/children', { method: 'POST', body: input }),
      update: (id: string, input: Partial<ChildInput>) =>
        call<{ child: ChildProfile }>(`/api/v1/children/${id}`, { method: 'PATCH', body: input }),
      archive: (id: string) => call<{ archived: boolean }>(`/api/v1/children/${id}`, { method: 'DELETE' }),
    },

    stories: {
      list: () => call<{ stories: LibraryCard[] }>('/api/v1/stories'),
      create: (input: CreateStoryInput) =>
        call<{ storyId: string }>('/api/v1/stories', { method: 'POST', body: input }),
      get: (id: string) =>
        call<{ story: ReaderStory; share: unknown }>(`/api/v1/stories/${id}`),
      progress: (id: string) => call<StoryProgress>(`/api/v1/stories/${id}/progress`),
      update: (id: string, input: { title?: string; isFavourite?: boolean }) =>
        call<{ title?: string; isFavourite?: boolean }>(`/api/v1/stories/${id}`, {
          method: 'PATCH',
          body: input,
        }),
      remove: (id: string) => call<{ deleted: boolean }>(`/api/v1/stories/${id}`, { method: 'DELETE' }),
      narrate: (id: string, input: { voiceSlug?: string | null; speed?: number } = {}) =>
        call<{ queued: boolean }>(`/api/v1/stories/${id}/narration`, { method: 'POST', body: input }),
      pdf: (id: string, input: { variant?: 'digital' | 'print'; pageSize?: 'a5' | 'a4' } = {}) =>
        call<{ url: string; pageCount: number | null }>(`/api/v1/stories/${id}/pdf`, {
          method: 'POST',
          body: input,
        }),
      share: (id: string, input: unknown) =>
        call<{ share: { url: string | null } }>(`/api/v1/stories/${id}/share`, {
          method: 'POST',
          body: input,
        }),
      retry: (id: string) => call<{ queued: boolean }>(`/api/v1/stories/${id}/retry`, { method: 'POST' }),
      retryIllustration: (id: string, illustrationId: string) =>
        call<{ queued: boolean }>(`/api/v1/stories/${id}/illustrations/${illustrationId}/retry`, {
          method: 'POST',
        }),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
