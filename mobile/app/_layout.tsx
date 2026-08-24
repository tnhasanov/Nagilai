import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, useColorScheme } from 'react-native';
import { SessionProvider, useSession } from '../src/session';
import { I18nProvider, useI18n } from '../src/i18n';
import { configureNotificationHandler, ensureAndroidChannel, storyIdFromResponse } from '../src/push';
import { darkPalette, lightPalette } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

// Registered at module scope, before any screen mounts: a notification
// that arrives while the app is opening must still be handled.
configureNotificationHandler();

/**
 * Root layout.
 *
 * Holds the interface language and the session, and keeps the splash
 * screen up until we know whether the parent is signed in - so the app
 * never flashes the sign-in screen at somebody who already has an
 * account.
 *
 * `I18nProvider` is outside `SessionProvider` deliberately. The language
 * has to be resolved before there is a session: a parent looking at the
 * sign-in screen should already see it in their own language, and the
 * session layer reads the provider to adopt the profile's locale once it
 * has one.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <Navigation />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { loading } = useSession();
  const { t, dictionary, ready } = useI18n();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? darkPalette : lightPalette;

  // Wait for the stored language too: a first frame in the wrong language
  // that corrects itself a moment later is worse than a slightly longer
  // splash.
  const booted = !loading && ready;

  useEffect(() => {
    if (booted) void SplashScreen.hideAsync();
  }, [booted]);

  // The Android channel is what a parent sees in their system settings,
  // so it is named in their language and re-declared when that changes.
  useEffect(() => {
    void ensureAndroidChannel(
      dictionary.settings.notifications,
      dictionary.settings.notificationsBody,
    );
  }, [dictionary]);

  useNotificationRouting();

  if (!booted) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.paper },
          headerTintColor: palette.ink,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.paper },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen
          name="story/[id]"
          options={{ title: '', headerBackTitle: t('tabs.library') }}
        />
        <Stack.Screen
          name="child/new"
          options={{ title: t('childForm.title'), presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}

/**
 * Opens the story a notification points at.
 *
 * Two cases, and missing either one is a notification that appears to do
 * nothing:
 *
 *  - **The app was already running.** The listener fires on tap.
 *  - **The app was closed.** There is no listener yet when the tap
 *    happens, so the response is read once from the last-response
 *    accessor after mount.
 *
 * The response is cleared afterwards so returning to the app later does
 * not re-navigate to a story the parent has already read and left.
 */
function useNotificationRouting(): void {
  const router = useRouter();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    /*
     * Native only. `expo-notifications` has no web implementation, and
     * `getLastNotificationResponse` does not fail softly there — it
     * throws during render and takes the whole tree with it, so the app
     * boots to a blank screen. `app.json` declares a web target and
     * `expo export --platform web` is how these screens get previewed
     * without a simulator, which is exactly when this bites.
     */
    if (Platform.OS === 'web') return;

    const open = (response: Notifications.NotificationResponse | null) => {
      const storyId = storyIdFromResponse(response);
      if (!storyId || handled.current === storyId) return;

      handled.current = storyId;
      Notifications.clearLastNotificationResponse();
      router.push(`/story/${storyId}`);
    };

    // Cold start: the tap that launched the app.
    open(Notifications.getLastNotificationResponse());

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);
}
