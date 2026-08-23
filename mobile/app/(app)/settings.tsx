import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useSession } from '../../src/session';
import { API_URL } from '../../src/api';
import { useI18n, LOCALES, LOCALE_FLAGS, LOCALE_NAMES, type Locale } from '../../src/i18n';
import { listOffline, reconcile, removeOffline, type OfflineEntry } from '../../src/offline';
import { permissionState, registerForPush, type PermissionState } from '../../src/push';
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  Heading,
  Screen,
  ToggleRow,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * Settings.
 *
 * Account, language, notifications, downloaded books, and the two things
 * a product holding children's data must always offer within reach:
 * export and deletion (§22). Both are done on the website, because a
 * destructive action deserves the confirmation flow that already exists
 * there rather than a second implementation.
 *
 * The language picker changes the *interface* only. It is worth saying so
 * on screen, because a parent reasonably expects a language control in a
 * storytelling app to change the stories.
 */
export default function Settings() {
  const { profile, notifications, api, signOut, setNotifications } = useSession();
  const palette = usePalette();
  const { t, locale, setLocale } = useI18n();

  const [offline, setOffline] = useState<OfflineEntry[]>([]);
  const [recovered, setRecovered] = useState<number>(0);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    // Reconcile first: the index is a claim, the filesystem is the truth,
    // and a book the OS reclaimed should stop being offered.
    const { bytesFreed } = await reconcile();
    if (bytesFreed > 0) setRecovered(bytesFreed);
    setOffline(await listOffline());
    setPermission(await permissionState());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalBytes = offline.reduce((sum, entry) => sum + entry.bytes, 0);

  /**
   * Changing the language writes to the device *and* to the profile, so
   * the website and the app converge rather than disagreeing.
   */
  async function chooseLocale(next: Locale) {
    await setLocale(next);
    if (profile) {
      void api
        .updateProfile({
          uiLocale: next,
          displayName: profile.displayName ?? '',
          marketingOptIn: false,
        })
        .catch(() => undefined);
    }
  }

  const pushAvailable = notifications?.available ?? false;

  async function enablePush() {
    setBusy(true);
    try {
      const result = await registerForPush(api, locale);
      setPermission(await permissionState());
      if (result.status === 'registered') {
        const { notifications: next } = await api.devices.get();
        setNotifications(next);
      }
    } finally {
      setBusy(false);
    }
  }

  async function updatePreference(patch: { pushEnabled?: boolean; storyReady?: boolean }) {
    // Optimistic: a switch that waits for a round trip before moving feels
    // broken on a slow connection.
    if (notifications) setNotifications({ ...notifications, ...patch });
    try {
      const { notifications: next } = await api.devices.preferences(patch);
      setNotifications(next);
    } catch {
      const { notifications: next } = await api.devices.get().catch(() => ({ notifications: null }));
      if (next) setNotifications(next);
    }
  }

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Card style={{ gap: spacing.xs }}>
          <Caption>{t('settings.signedInAs')}</Caption>
          <Heading>{profile?.displayName ?? profile?.email ?? '—'}</Heading>
          {profile ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <View
                style={{
                  backgroundColor: palette.amberSoft,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                }}
              >
                <Text style={[type.label, { color: palette.amberDeep }]}>
                  ✨ {t('settings.credits', { count: profile.creditBalance })}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading>{t('settings.language')}</Heading>
          <Caption>{t('settings.languageHint')}</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {LOCALES.map((option) => (
              <Chip
                key={option}
                label={`${LOCALE_FLAGS[option]} ${LOCALE_NAMES[option]}`}
                selected={option === locale}
                onPress={() => void chooseLocale(option)}
              />
            ))}
          </View>
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading>{t('settings.notifications')}</Heading>

          {!pushAvailable ? (
            <Caption>{t('settings.notificationsUnavailable')}</Caption>
          ) : permission === 'denied' ? (
            <>
              <Body>{t('settings.notificationsDenied')}</Body>
              <Button
                label={t('settings.openPhoneSettings')}
                variant="secondary"
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : permission === 'granted' && (notifications?.devices.length ?? 0) > 0 ? (
            <>
              <ToggleRow
                label={t('settings.enableNotifications')}
                description={t('settings.notificationsBody')}
                value={notifications?.storyReady ?? true}
                onValueChange={(next) => void updatePreference({ storyReady: next })}
              />
              {notifications && notifications.quietFromMinute !== null && notifications.quietToMinute !== null ? (
                <Caption>
                  {t('settings.quietHoursValue', {
                    from: formatMinute(notifications.quietFromMinute),
                    to: formatMinute(notifications.quietToMinute),
                  })}
                </Caption>
              ) : (
                <Caption>
                  {t('settings.quietHours')}: {t('settings.quietHoursOff')}
                </Caption>
              )}
            </>
          ) : (
            <>
              <Body>{t('settings.notificationsBody')}</Body>
              <Button
                label={t('settings.enableNotifications')}
                variant="secondary"
                loading={busy}
                onPress={() => void enablePush()}
              />
            </>
          )}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading>{t('settings.booksOnDevice')}</Heading>
          <Body>
            {offline.length === 0
              ? t('settings.booksEmpty')
              : t('settings.booksSummary', {
                  count:
                    offline.length === 1
                      ? t('settings.bookCountOne')
                      : t('settings.bookCount', { count: offline.length }),
                  size: formatBytes(totalBytes),
                })}
          </Body>

          {recovered > 0 ? (
            <Caption>{t('settings.storageRecovered', { size: formatBytes(recovered) })}</Caption>
          ) : null}

          {offline.map((entry) => (
            <View
              key={entry.storyId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: palette.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { color: palette.ink }]} numberOfLines={1}>
                  {entry.title}
                </Text>
                <Caption>
                  {entry.assetsStored < entry.assetsExpected
                    ? t('reader.saveIncomplete', {
                        count: entry.assetsExpected - entry.assetsStored,
                      })
                    : formatBytes(entry.bytes)}
                </Caption>
              </View>
              <Button
                label={t('common.remove')}
                variant="ghost"
                onPress={async () => {
                  await removeOffline(entry.storyId);
                  await refresh();
                }}
              />
            </View>
          ))}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading>{t('settings.yourData')}</Heading>
          <Body>{t('settings.yourDataBody')}</Body>
          <Button
            label={t('settings.openAccountSettings')}
            variant="secondary"
            onPress={() => void Linking.openURL(`${API_URL}/settings`)}
          />
          <Caption>{t('settings.privacyNote')}</Caption>
        </Card>

        <Button
          label={t('settings.signOut')}
          variant="ghost"
          onPress={() =>
            Alert.alert(t('settings.signOutTitle'), t('settings.signOutBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('settings.signOut'),
                style: 'destructive',
                onPress: () => void signOut(),
              },
            ])
          }
        />

        <Caption style={{ textAlign: 'center' }}>{t('common.appName')}</Caption>
      </ScrollView>
    </Screen>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 1 ? `${Math.round(bytes / 1024)} KB` : `${megabytes.toFixed(1)} MB`;
}

/** Minutes past midnight as a 24-hour clock time. */
function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
