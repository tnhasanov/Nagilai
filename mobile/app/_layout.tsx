import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { SessionProvider, useSession } from '../src/session';
import { darkPalette, lightPalette } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Root layout.
 *
 * Holds the session and keeps the splash screen up until we know whether
 * the parent is signed in - so the app never flashes the sign-in screen
 * at somebody who already has an account.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Navigation />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { loading } = useSession();
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? darkPalette : lightPalette;

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

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
        <Stack.Screen name="story/[id]" options={{ title: '', headerBackTitle: 'Library' }} />
        <Stack.Screen name="child/new" options={{ title: 'Add a child', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
