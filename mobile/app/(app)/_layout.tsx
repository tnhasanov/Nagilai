import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useSession } from '../../src/session';
import { useT } from '../../src/i18n';
import { usePalette } from '../../src/components/ui';

/**
 * The signed-in shell.
 *
 * Tabs rather than a drawer: four destinations, all of them things a
 * parent reaches for directly. The redirect is a convenience — the API
 * enforces the real boundary, and RLS enforces it again in the database.
 */
export default function AppLayout() {
  const { session } = useSession();
  const palette = usePalette();
  const t = useT();

  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.paper },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: palette.amberDeep,
        tabBarInactiveTintColor: palette.inkFaint,
        tabBarStyle: { backgroundColor: palette.paper, borderTopColor: palette.line },
        sceneStyle: { backgroundColor: palette.paper },
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: t('tabs.create'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="✨" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="children"
        options={{
          title: t('tabs.children'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="🧒" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

/*
 * Focus is shown with opacity, not colour. Emoji glyphs ignore a Text
 * colour on both platforms, so tinting the active tab amber changed
 * nothing — the only signal of where you were was the 10pt label.
 */
function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{glyph}</Text>;
}
