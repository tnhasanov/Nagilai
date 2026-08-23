import { authenticated, body, preflight } from '@/services/api/handler';
import {
  deviceRegistrationSchema,
  registerDevice,
  unregisterDevice,
  getNotificationPreferences,
  setNotificationPreferences,
  notificationPreferencesSchema,
} from '@/features/account/operations';
import { z } from 'zod';

/**
 * Push devices and notification preferences.
 *
 * The native app calls `POST` once it has an OS-granted push token, and
 * `DELETE` when the parent signs out -- a token left registered on a
 * signed-out phone would keep telling somebody about a family's books.
 *
 * `PATCH` carries the preferences, which live here rather than on `/me`
 * because they belong to the same screen as the device list and are read
 * and written together.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated(async ({ actor }) => ({
  notifications: await getNotificationPreferences(actor.userId, actor.db),
}));

export const POST = authenticated(async ({ actor, request }) => {
  const input = await body(request, deviceRegistrationSchema);
  return registerDevice(actor.userId, input);
});

export const PATCH = authenticated(async ({ actor, request }) => {
  const input = await body(request, notificationPreferencesSchema);
  return { notifications: await setNotificationPreferences(actor.userId, input, actor.db) };
});

const removalSchema = z.object({ token: z.string().trim().min(8).max(512) });

export const DELETE = authenticated(async ({ actor, request }) => {
  const input = await body(request, removalSchema);
  return unregisterDevice(actor.userId, input.token);
});
