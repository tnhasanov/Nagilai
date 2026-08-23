import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Supabase client for the native app.
 *
 * Sign-in happens here rather than through our API: the SDK handles token
 * refresh, and the JWT it produces is what `/api/v1` verifies. One
 * identity system for web and mobile.
 *
 * Tokens live in the device keychain / keystore via SecureStore, not in
 * AsyncStorage. On a shared family phone that is the difference between a
 * session another app could read off disk and one the OS protects.
 *
 * SecureStore has a 2048-byte limit per value and Supabase sessions can
 * exceed it, so long values are chunked rather than silently truncated -
 * a truncated session is a sign-in loop that only shows up on real
 * devices.
 */

const CHUNK_LIMIT = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith('__chunked__:')) return head;

    const count = Number.parseInt(head.slice('__chunked__:'.length), 10);
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null; // Incomplete: treat as signed out.
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);

    if (value.length <= CHUNK_LIMIT) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_LIMIT);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_LIMIT, (i + 1) * CHUNK_LIMIT));
    }
    await SecureStore.setItemAsync(key, `__chunked__:${count}`);
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

async function clearChunks(key: string): Promise<void> {
  const head = await SecureStore.getItemAsync(key).catch(() => null);
  if (!head?.startsWith('__chunked__:')) return;

  const count = Number.parseInt(head.slice('__chunked__:'.length), 10);
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => undefined);
  }
}

// SecureStore does not exist on web; Expo's web target falls back to
// AsyncStorage, which is localStorage there.
const storage = Platform.OS === 'web' ? AsyncStorage : secureStorage;

let cached: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. See mobile/.env.example.',
    );
  }

  cached = createClient(url, anonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL to read a session from in a native app.
      detectSessionInUrl: false,
    },
  });
  return cached;
}
