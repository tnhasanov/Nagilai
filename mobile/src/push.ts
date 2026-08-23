import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Api } from './api';
import type { Locale } from './i18n';

/**
 * Push notifications.
 *
 * The problem this solves: a book takes a minute or two to generate, and
 * everything else in the product is arranged so a parent does not have to
 * sit and watch. Without this they do.
 *
 * Three things here are deliberate and easy to get wrong:
 *
 *  1. **Ask the server before asking the OS.** iOS gives an app *one*
 *     permission prompt. Spending it before the backend can actually
 *     deliver a push wastes it permanently -- after a refusal the only
 *     route back is the Settings app, which nobody takes. So the app
 *     checks `notifications.available` first.
 *  2. **Ask in context, not at launch.** The prompt appears when a parent
 *     starts a story, where the offer means something, rather than on
 *     first open where it reads as a demand.
 *  3. **A simulator has no push token.** `Device.isDevice` guards it;
 *     without that, development on a simulator throws on every launch.
 */

const DEVICE_ID_KEY = 'nagilai.deviceId';
const ASKED_KEY = 'nagilai.push.asked';

export const CHANNEL_STORIES = 'stories';

/**
 * Whether a notification is shown while the app is in the foreground.
 *
 * Yes for a finished story: a parent who is in the library when the book
 * lands should see it arrive, and the alternative is a screen that
 * silently changes underneath them.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android requires a channel before anything can be delivered, and the
 * channel is what a parent sees in the system settings -- so it is named
 * in their language, not ours.
 */
export async function ensureAndroidChannel(name: string, description: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_STORIES, {
    name,
    description,
    importance: Notifications.AndroidImportance.DEFAULT,
    // A story finishing is good news, not an emergency.
    vibrationPattern: [0, 120],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  }).catch(() => undefined);
}

/** A stable id for this installation, so a token rotation replaces a row. */
export async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null);
  if (existing) return existing;

  // `randomUUID` exists in Hermes; the fallback keeps the web target working.
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  await AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => undefined);
  return id;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permissionState(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';

  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    // `denied` with `canAskAgain` still true is the Android "dismissed"
    // case, which is not a refusal.
    return status === 'denied' && !canAskAgain ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Whether the parent has already been shown the in-app explanation. */
export async function hasAskedBefore(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === 'yes';
}

export async function markAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, 'yes').catch(() => undefined);
}

/**
 * The Expo project id, which `getExpoPushTokenAsync` needs in a build.
 *
 * Present only once `eas init` has written it. Returning null rather than
 * throwing means an app built before that still runs -- it simply has no
 * push, which is the honest outcome.
 */
export function expoProjectId(): string | null {
  const fromConfig =
    Constants.expoConfig?.extra?.['eas']?.['projectId'] ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (typeof fromConfig !== 'string') return null;
  // The placeholder committed to the repository is not a project id.
  if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(fromConfig)) return null;
  return fromConfig;
}

export interface RegistrationResult {
  status: 'registered' | 'denied' | 'unsupported' | 'not-configured' | 'failed';
  token?: string;
}

/**
 * Asks the OS for permission, gets a token, and tells the server.
 *
 * Only ever called after the server has said push is available and the
 * parent has said yes to the in-app explanation -- see the rule at the
 * top of this file about spending the one prompt iOS allows.
 */
export async function registerForPush(api: Api, locale: Locale): Promise<RegistrationResult> {
  if (!Device.isDevice) return { status: 'unsupported' };

  const projectId = expoProjectId();
  if (!projectId) return { status: 'not-configured' };

  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.status === 'granted';

    if (!granted && current.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.status === 'granted';
    }

    if (!granted) return { status: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.devices.register({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      deviceId: await installationId(),
      deviceName: Device.deviceName ?? Device.modelName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
      locale,
    });

    return { status: 'registered', token };
  } catch {
    // Offline, or Expo's token service unreachable. Not worth surfacing:
    // the parent still gets their book, just without being told.
    return { status: 'failed' };
  }
}

/**
 * Removes this device's registration.
 *
 * Called on sign-out. A token left registered on a signed-out phone would
 * keep telling whoever holds it about a family's books, which on a shared
 * family device is exactly the wrong outcome.
 */
export async function unregisterFromPush(api: Api): Promise<void> {
  const projectId = expoProjectId();
  if (!projectId || !Device.isDevice) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.devices.unregister(token);
  } catch {
    // A device that cannot reach the server on sign-out keeps its
    // registration until the next sign-in replaces it, which re-points
    // the token at whoever signs in.
  }
}

/**
 * The story a notification points at, if any.
 *
 * The server puts both a `storyId` and a full `nagilai://` URL in the
 * payload; this reads the id, because the app already knows how to route
 * to a story and re-parsing our own URL would be a second place to get it
 * wrong.
 */
export function storyIdFromResponse(response: Notifications.NotificationResponse | null): string | null {
  if (!response) return null;

  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const storyId = data?.['storyId'];
  return typeof storyId === 'string' && storyId.length > 0 ? storyId : null;
}
