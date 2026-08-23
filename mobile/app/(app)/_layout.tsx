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
          tabBarIcon: ({ color }) => <TabIcon glyph="📚" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: t('tabs.create'),
          tabBarIcon: ({ color }) => <TabIcon glyph="✨" color={color} />,
        }}
      />
      <Tabs.Screen
        name="children"
        options={{
          title: t('tabs.children'),
          tabBarIcon: ({ color }) => <TabIcon glyph="🧒" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}
