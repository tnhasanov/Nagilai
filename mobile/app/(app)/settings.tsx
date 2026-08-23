import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useSession } from '../../src/session';
import { API_URL } from '../../src/api';
import { listOffline, removeOffline, type OfflineEntry } from '../../src/offline';
import {
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Screen,
  spacing,
  type,
  usePalette,
} from '../../src/components/ui';

/**
 * Settings.
 *
 * Account, downloaded books, and the two things a product holding
 * children's data must always offer within reach: export and deletion
 * (§22). Both are done on the website, because a destructive action
 * deserves the confirmation flow that already exists there rather than a
 * second implementation.
 */
export default function Settings() {
  const { profile, signOut } = useSession();
  const palette = usePalette();

  const [offline, setOffline] = useState<OfflineEntry[]>([]);

  const refresh = useCallback(async () => setOffline(await listOffline()), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalBytes = offline.reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Card style={{ gap: spacing.xs }}>
          <Caption>Signed in as</Caption>
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
                  ✨ {profile.creditBalance} credits
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Heading>Books on this device</Heading>
          <Body>
            {offline.length === 0
              ? 'Save a book from its page to read it without a connection.'
              : `${offline.length} book${offline.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
          </Body>

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
                <Caption>{formatBytes(entry.bytes)}</Caption>
              </View>
              <Button
                label="Remove"
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
          <Heading>Your data</Heading>
          <Body>
            You can download everything in your account, or delete it permanently, from your account
            settings on the web.
          </Body>
          <Button
            label="Open account settings"
            variant="secondary"
            onPress={() => void Linking.openURL(`${API_URL}/settings`)}
          />
          <Caption>
            Your child&apos;s details are never public and are never used to train any model.
          </Caption>
        </Card>

        <Button
          label="Sign out"
          variant="ghost"
          onPress={() =>
            Alert.alert('Sign out?', 'Books saved on this device will stay available.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        />

        <Caption style={{ textAlign: 'center' }}>Nagilai</Caption>
      </ScrollView>
    </Screen>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 1 ? `${Math.round(bytes / 1024)} KB` : `${megabytes.toFixed(1)} MB`;
}
