import 'server-only';

import { z } from 'zod';
import { errors } from '@/lib/errors';
import { DEFAULT_UI_LOCALE, UI_LOCALES } from '@/config/constants';
import type { UserClient } from '@/services/supabase/user-client';
import { supabaseServer } from '@/services/supabase/server';
import * as notifications from '@/services/notifications';
import { getSetting } from '@/services/config/settings';

/** Same seam the story operations use: a bearer client or the cookie one. */
async function client(db?: UserClient): Promise<UserClient> {
  return db ?? (await supabaseServer());
}

/**
 * Account operations shared by the website and the native app.
 *
 * The same rule the story operations follow: one implementation, wrapped
 * thinly by a server action for the web and by an `/api/v1` route for
 * mobile. The wrappers differ only in how they establish the caller and,
 * for the web, in setting the locale cookie -- which is a browser concern
 * that has no meaning on a phone.
 *
 * Every function takes the owner id from a verified session. None of them
 * accepts one from a request body.
 */

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export const profileInputSchema = z.object({
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  uiLocale: z.enum(UI_LOCALES).default(DEFAULT_UI_LOCALE),
  marketingOptIn: z.boolean().default(false),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export async function updateProfile(
  ownerId: string,
  input: ProfileInput,
  db?: UserClient,
): Promise<{ updated: boolean; uiLocale: string }> {
  const scoped = await client(db);

  const { error } = await scoped
    .from('profiles')
    .update({
      display_name: input.displayName || null,
      ui_locale: input.uiLocale,
      marketing_opt_in: input.marketingOptIn,
    })
    .eq('id', ownerId);

  if (error) throw errors.validation('We could not save your settings.');

  return { updated: true, uiLocale: input.uiLocale };
}

/**
 * Sets only the interface language.
 *
 * Separate from `updateProfile` because it is the one setting a parent
 * changes from a menu rather than a form, and because it must not require
 * the rest of the profile to be present. Interface language and *story*
 * language are unrelated: this changes the buttons, never the books.
 */
export const localeInputSchema = z.object({ uiLocale: z.enum(UI_LOCALES) });

export async function setUiLocale(
  ownerId: string,
  locale: (typeof UI_LOCALES)[number],
  db?: UserClient,
): Promise<{ uiLocale: string }> {
  const scoped = await client(db);

  const { error } = await scoped.from('profiles').update({ ui_locale: locale }).eq('id', ownerId);
  if (error) throw errors.validation('We could not change the language.');

  return { uiLocale: locale };
}

/* ------------------------------------------------------------------ */
/* Notification preferences                                            */
/* ------------------------------------------------------------------ */

/**
 * Quiet hours are wall-clock minutes past local midnight, in the
 * profile's timezone. `null` for both means no quiet window.
 *
 * Minutes rather than a time string because the comparison happens in SQL
 * and in TypeScript, and an integer has no timezone, no format and no
 * parsing ambiguity.
 */
const minuteOfDay = z.number().int().min(0).max(1439);

export const notificationPreferencesSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    storyReady: z.boolean().optional(),
    quietFromMinute: minuteOfDay.nullable().optional(),
    quietToMinute: minuteOfDay.nullable().optional(),
    timezone: z.string().trim().max(64).nullable().optional(),
  })
  .refine(
    (value) =>
      // Both or neither: half a window is not a window.
      (value.quietFromMinute ?? null) === null === ((value.quietToMinute ?? null) === null) ||
      value.quietFromMinute === undefined ||
      value.quietToMinute === undefined,
    { message: 'Set both ends of the quiet period, or neither.', path: ['quietFromMinute'] },
  );

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export interface NotificationPreferences {
  pushEnabled: boolean;
  storyReady: boolean;
  quietFromMinute: number | null;
  quietToMinute: number | null;
  timezone: string | null;
  /**
   * Whether the product can currently deliver a push at all. The app uses
   * this to decide whether to ask for the OS permission -- asking for a
   * permission we cannot yet honour spends the one prompt iOS gives you.
   */
  available: boolean;
  /** True only when a real push transport is configured. */
  providerLive: boolean;
  devices: notifications.RegisteredDevice[];
}

export async function getNotificationPreferences(
  ownerId: string,
  db?: UserClient,
): Promise<NotificationPreferences> {
  const scoped = await client(db);

  const [{ data }, features, devices] = await Promise.all([
    scoped
      .from('profiles')
      .select('push_enabled, push_story_ready, push_quiet_from_minute, push_quiet_to_minute, timezone')
      .eq('id', ownerId)
      .maybeSingle(),
    getSetting('features'),
    notifications.listDevices(ownerId),
  ]);

  return {
    pushEnabled: data?.push_enabled ?? true,
    storyReady: data?.push_story_ready ?? true,
    quietFromMinute: data?.push_quiet_from_minute ?? null,
    quietToMinute: data?.push_quiet_to_minute ?? null,
    timezone: data?.timezone ?? null,
    available: features.push_notifications_enabled,
    providerLive: notifications.pushProvider().live,
    devices,
  };
}

export async function setNotificationPreferences(
  ownerId: string,
  input: NotificationPreferencesInput,
  db?: UserClient,
): Promise<NotificationPreferences> {
  const scoped = await client(db);

  // Spread rather than assigned, so the update is typed against the
  // generated row shape and an unknown column is a compile error rather
  // than a silently ignored write.
  const patch = {
    ...(input.pushEnabled !== undefined ? { push_enabled: input.pushEnabled } : {}),
    ...(input.storyReady !== undefined ? { push_story_ready: input.storyReady } : {}),
    ...(input.quietFromMinute !== undefined
      ? { push_quiet_from_minute: input.quietFromMinute }
      : {}),
    ...(input.quietToMinute !== undefined ? { push_quiet_to_minute: input.quietToMinute } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };

  if (Object.keys(patch).length > 0) {
    const { error } = await scoped.from('profiles').update(patch).eq('id', ownerId);
    if (error) throw errors.validation('We could not save your notification settings.');
  }

  return getNotificationPreferences(ownerId, db);
}

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export const deviceRegistrationSchema = z.object({
  token: z.string().trim().min(8).max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().trim().max(128).nullable().optional(),
  deviceName: z.string().trim().max(128).nullable().optional(),
  appVersion: z.string().trim().max(32).nullable().optional(),
  locale: z.string().trim().max(16).nullable().optional(),
});

export type DeviceRegistrationInput = z.infer<typeof deviceRegistrationSchema>;

/**
 * Registers this installation for push.
 *
 * The owner is the authenticated caller, always. A token is enough to
 * notify a device, so accepting an owner id from the body would let any
 * signed-in parent redirect somebody else's notifications to their phone.
 */
export async function registerDevice(
  ownerId: string,
  input: DeviceRegistrationInput,
): Promise<{ registered: boolean }> {
  return notifications.registerDevice(ownerId, {
    token: input.token,
    platform: input.platform,
    deviceId: input.deviceId ?? null,
    deviceName: input.deviceName ?? null,
    appVersion: input.appVersion ?? null,
    locale: input.locale ?? null,
  });
}

export async function unregisterDevice(
  ownerId: string,
  token: string,
): Promise<{ removed: boolean }> {
  return notifications.unregisterDevice(ownerId, token);
}
