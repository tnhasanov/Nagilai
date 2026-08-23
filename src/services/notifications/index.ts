import 'server-only';

import { createLogger, describeError } from '@/lib/logger';
import { supabaseAdmin } from '@/services/supabase/admin';
import { getSetting } from '@/services/config/settings';
import { getDictionary, format } from '@/i18n';
import { DEFAULT_UI_LOCALE, isUiLocale, type UiLocale } from '@/config/constants';
import type { PushMessage, PushProvider } from './types';
import { ExpoPushProvider } from './expo-push';
import { ConsolePushProvider } from './console-push';

export type { PushMessage, PushProvider, PushTicket } from './types';

/**
 * Notifications (§25, and the reason the native app is worth having).
 *
 * A book takes minutes to generate. Everything else in the product is
 * built so a parent does not have to wait and watch, and this is the piece
 * that closes that loop: put the phone down, get told when it is ready,
 * tap through to the finished story.
 *
 * The shape of this module matters more than the transport:
 *
 *  - **Nothing here decides who owns a device.** The owner id always comes
 *    from a verified session, never from the request body.
 *  - **Sending is idempotent.** A story finishing is not one event -- the
 *    text job completes, then eleven illustration jobs complete, and each
 *    asks "is this story done now?". A unique `dedupe_key` is what stops
 *    a parent being told twelve times.
 *  - **Three independent gates before anything is sent**: the feature
 *    flag, the parent's own preference, and the OS permission that the
 *    device had to grant before a token existed at all.
 *  - **It works with no credentials.** Without a push provider the console
 *    provider runs and records a `skipped` delivery, so the whole path is
 *    exercisable before an Apple or Google account exists.
 */
const log = createLogger('notifications');

const CHANNEL_STORIES = 'stories';

/* ------------------------------------------------------------------ */
/* Provider selection                                                  */
/* ------------------------------------------------------------------ */

let cachedProvider: PushProvider | null = null;

/**
 * The only place that decides which transport is used.
 *
 * Expo's push service accepts unauthenticated requests for tokens issued
 * to your own project, so the access token is optional -- but a project
 * with "enhanced security" switched on requires it, and setting it is
 * strictly better. Either way, the *absence* of an Expo project is what
 * selects the console provider.
 */
export function pushProvider(): PushProvider {
  if (cachedProvider) return cachedProvider;

  const configured = process.env.EXPO_PUSH_ENABLED === 'true';
  cachedProvider = configured
    ? new ExpoPushProvider(process.env.EXPO_ACCESS_TOKEN)
    : new ConsolePushProvider();

  return cachedProvider;
}

/** Test seam: lets a test install a fake without touching the environment. */
export function __setPushProvider(provider: PushProvider | null): void {
  cachedProvider = provider;
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export interface DeviceRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
  locale?: string | null;
}

export interface RegisteredDevice {
  id: string;
  platform: string;
  deviceName: string | null;
  locale: string;
  lastSeenAt: string;
  createdAt: string;
}

/**
 * Records (or refreshes) one installation's push token.
 *
 * Two conflicts have to be resolved, and they are different:
 *
 *  - **Same token, different owner.** A tablet handed to another parent
 *    re-registers the same token under a new account. The old row must
 *    stop receiving the first family's notifications, so the token's
 *    unique index makes this an update of ownership, not a second row.
 *  - **Same installation, new token.** iOS and Android rotate tokens. The
 *    `(owner_id, device_id)` index means the installation replaces its own
 *    token rather than accumulating dead ones.
 */
export async function registerDevice(
  ownerId: string,
  input: DeviceRegistration,
): Promise<{ registered: boolean }> {
  const admin = supabaseAdmin();
  const locale = isUiLocale(input.locale) ? input.locale : DEFAULT_UI_LOCALE;

  // Retire any other row this installation left behind under this owner.
  if (input.deviceId) {
    await admin
      .from('device_push_tokens')
      .delete()
      .eq('owner_id', ownerId)
      .eq('device_id', input.deviceId)
      .neq('token', input.token);
  }

  const { error } = await admin.from('device_push_tokens').upsert(
    {
      owner_id: ownerId,
      token: input.token,
      platform: input.platform,
      device_id: input.deviceId ?? null,
      device_name: input.deviceName ?? null,
      app_version: input.appVersion ?? null,
      locale,
      // A re-registration is how a previously dead token comes back after
      // a reinstall, so clear the tombstone.
      disabled_at: null,
      disabled_reason: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  if (error) {
    log.error('could not register device', { error: error.message });
    return { registered: false };
  }

  return { registered: true };
}

export async function unregisterDevice(ownerId: string, token: string): Promise<{ removed: boolean }> {
  const { error } = await supabaseAdmin()
    .from('device_push_tokens')
    .delete()
    .eq('owner_id', ownerId)
    .eq('token', token);

  if (error) {
    log.error('could not unregister device', { error: error.message });
    return { removed: false };
  }
  return { removed: true };
}

export async function listDevices(ownerId: string): Promise<RegisteredDevice[]> {
  const { data, error } = await supabaseAdmin()
    .from('device_push_tokens')
    .select('id, platform, device_name, locale, last_seen_at, created_at')
    .eq('owner_id', ownerId)
    .is('disabled_at', null)
    .order('last_seen_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    platform: row.platform,
    deviceName: row.device_name,
    locale: row.locale,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/* Quiet hours                                                         */
/* ------------------------------------------------------------------ */

/**
 * Whether local wall-clock `minute` falls inside a quiet window.
 *
 * Exported because the wrap-around case (22:00 to 07:00) is the one that
 * is always wrong the first time, and it deserves its own test rather than
 * being discovered by a parent at 3am.
 */
export function isQuietNow(
  minuteOfDay: number,
  from: number | null | undefined,
  to: number | null | undefined,
): boolean {
  if (from == null || to == null) return false;
  if (from === to) return false;
  return from < to
    ? minuteOfDay >= from && minuteOfDay < to
    : minuteOfDay >= from || minuteOfDay < to;
}

/** Minutes past local midnight in an IANA timezone, for a given instant. */
export function minuteOfDayIn(timezone: string | null, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone ?? 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    // An unrecognised timezone must not stop a notification; it only
    // means quiet hours are evaluated in UTC.
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

/* ------------------------------------------------------------------ */
/* Story-ready                                                         */
/* ------------------------------------------------------------------ */

export interface NotifyResult {
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  deviceCount: number;
}

/**
 * Tells a parent their book is finished.
 *
 * Called after every job that could have been the last one, so the first
 * thing it does is decide whether the story is *actually* complete. Story
 * status is derived rather than assigned (see `docs/DECISIONS.md` §2.3),
 * so this reads the derived value rather than trusting the caller.
 */
export async function notifyStoryReady(input: {
  ownerId: string;
  storyId: string;
}): Promise<NotifyResult> {
  const admin = supabaseAdmin();

  const { data: story } = await admin
    .from('stories')
    .select('id, title, status, child_snapshot, owner_id')
    .eq('id', input.storyId)
    .maybeSingle();

  if (!story) return skip(input, 'story_missing');

  // `ready` is the derived status meaning "this book can be read", which
  // is the thing a parent is waiting to hear. It is deliberately reached
  // even when one illustration failed -- the reader offers a per-image
  // retry, and a book with fifteen of sixteen pictures is still a book.
  if (story.status !== 'ready') {
    return { status: 'skipped', reason: 'not_ready', deviceCount: 0 };
  }

  // One notification per story, ever. The unique index on `dedupe_key` is
  // the mechanism; this insert either wins or tells us somebody already
  // sent it.
  const dedupeKey = `story_ready:${story.id}`;

  const { data: claimed, error: claimError } = await admin
    .from('notification_deliveries')
    .insert({
      owner_id: input.ownerId,
      story_id: story.id,
      kind: 'story_ready',
      dedupe_key: dedupeKey,
      status: 'skipped',
      detail: { stage: 'claimed' },
    })
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) {
    // A unique violation here is the normal case, not an error: it means
    // one of the sibling illustration jobs got there first.
    return { status: 'skipped', reason: 'already_notified', deviceCount: 0 };
  }

  const finish = async (result: NotifyResult, detail: Record<string, unknown>) => {
    await admin
      .from('notification_deliveries')
      .update({
        status: result.status,
        device_count: result.deviceCount,
        detail: { ...detail, reason: result.reason ?? null },
      })
      .eq('id', claimed.id);
    return result;
  };

  const features = await getSetting('features');
  if (!features.push_notifications_enabled) {
    return finish({ status: 'skipped', reason: 'feature_disabled', deviceCount: 0 }, {});
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('ui_locale, timezone, push_enabled, push_story_ready, push_quiet_from_minute, push_quiet_to_minute')
    .eq('id', input.ownerId)
    .maybeSingle();

  if (!profile) return finish({ status: 'skipped', reason: 'profile_missing', deviceCount: 0 }, {});
  if (!profile.push_enabled || !profile.push_story_ready) {
    return finish({ status: 'skipped', reason: 'preference_off', deviceCount: 0 }, {});
  }

  if (
    isQuietNow(
      minuteOfDayIn(profile.timezone),
      profile.push_quiet_from_minute,
      profile.push_quiet_to_minute,
    )
  ) {
    return finish({ status: 'skipped', reason: 'quiet_hours', deviceCount: 0 }, {});
  }

  const { data: devices } = await admin
    .from('device_push_tokens')
    .select('id, token, platform, locale')
    .eq('owner_id', input.ownerId)
    .is('disabled_at', null);

  if (!devices || devices.length === 0) {
    return finish({ status: 'skipped', reason: 'no_devices', deviceCount: 0 }, {});
  }

  const childName = readChildName(story.child_snapshot);
  const provider = pushProvider();

  const messages: PushMessage[] = devices.map((device) => {
    // The device's own locale, not the profile's: a household may have
    // one phone in Azerbaijani and another in Russian.
    const locale = isUiLocale(device.locale)
      ? device.locale
      : isUiLocale(profile.ui_locale)
        ? profile.ui_locale
        : DEFAULT_UI_LOCALE;

    return {
      token: device.token,
      ...storyReadyCopy(locale, story.title ?? fallbackTitle(locale), childName),
      data: {
        type: 'story_ready',
        storyId: story.id,
        // The app reads this rather than parsing the type, so the deep
        // link is data the server controls rather than a convention the
        // client has to reimplement.
        url: `nagilai://story/${story.id}`,
      },
      channelId: CHANNEL_STORIES,
    };
  });

  const tickets = await provider.send(messages);

  await retireDeadTokens(tickets, devices);

  const delivered = tickets.filter((ticket) => ticket.ok).length;

  return finish(
    {
      status: delivered > 0 ? 'sent' : 'failed',
      ...(provider.live ? {} : { reason: 'provider_not_live' }),
      deviceCount: delivered,
    },
    { provider: provider.name, live: provider.live, attempted: messages.length },
  );
}

function skip(input: { storyId: string }, reason: string): NotifyResult {
  log.warn('notification skipped', { storyId: input.storyId, reason });
  return { status: 'skipped', reason, deviceCount: 0 };
}

/**
 * A token the provider says is dead is disabled rather than deleted.
 *
 * Deleted, it would be silently re-created by the next registration and
 * the failure would repeat. Disabled with a reason, it stops costing
 * requests and an operator can see what happened.
 */
async function retireDeadTokens(
  tickets: readonly { token: string; unregistered?: boolean; error?: string }[],
  devices: readonly { id: string; token: string }[],
): Promise<void> {
  const dead = tickets.filter((ticket) => ticket.unregistered);
  if (dead.length === 0) return;

  const ids = devices
    .filter((device) => dead.some((ticket) => ticket.token === device.token))
    .map((device) => device.id);

  if (ids.length === 0) return;

  const { error } = await supabaseAdmin()
    .from('device_push_tokens')
    .update({ disabled_at: new Date().toISOString(), disabled_reason: 'DeviceNotRegistered' })
    .in('id', ids);

  if (error) log.warn('could not retire dead tokens', describeError(error));
}

/**
 * A story whose title generation failed still deserves a notification;
 * the parent can open it and rename it.
 */
function fallbackTitle(locale: UiLocale): string {
  return getDictionary(locale).common.appName;
}

/** Never trust a jsonb snapshot's shape. */
function readChildName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const record = snapshot as Record<string, unknown>;
  const value = record['displayName'] ?? record['nickname'] ?? record['name'];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * The copy, in the parent's language.
 *
 * Exported for tests: "does every locale actually produce a body, and does
 * the child's name reach it" is a question worth answering without a
 * database.
 */
export function storyReadyCopy(
  locale: UiLocale,
  title: string,
  childName: string | null,
): { title: string; body: string } {
  const dictionary = getDictionary(locale);
  const copy = dictionary.notifications;

  return {
    title: copy.storyReadyTitle,
    body: childName
      ? format(copy.storyReadyBodyNamed, { title, child: childName })
      : format(copy.storyReadyBody, { title }),
  };
}
