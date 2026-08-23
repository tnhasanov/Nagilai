import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { createApi, type Api, type NotificationPreferences, type Profile } from './api';
import { useI18n } from './i18n';
import { clearOffline } from './offline';
import { unregisterFromPush } from './push';

/**
 * Session state for the whole app.
 *
 * Holds the Supabase session, exposes an API client already carrying the
 * access token, and keeps the profile (and therefore the credit balance)
 * fresh.
 *
 * The AppState listener is why token refresh works at all on a phone:
 * Supabase refreshes on a timer, and a backgrounded app has no timers.
 * Without this, coming back to the app after lunch means a 401.
 *
 * Signing out does three things, and all three matter on a shared family
 * tablet: it ends the session, it removes this device's push
 * registration so the next family is not told about the last one's books,
 * and it deletes the downloaded stories.
 */
interface SessionValue {
  session: Session | null;
  profile: Profile | null;
  notifications: NotificationPreferences | null;
  loading: boolean;
  api: Api;
  refreshProfile: () => Promise<void>;
  setNotifications: (next: NotificationPreferences) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const { adoptProfileLocale } = useI18n();

  useEffect(() => {
    const client = supabase();

    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setNotifications(null);
      }
    });

    // Supabase's refresh timer does not run while the app is backgrounded.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });

    client.auth.startAutoRefresh();

    return () => {
      subscription.subscription.unsubscribe();
      appState.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  const token = session?.access_token ?? null;
  const api = useMemo(() => createApi(token), [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setNotifications(null);
      return;
    }
    try {
      const { profile: next, notifications: preferences } = await api.me();
      setProfile(next);
      setNotifications(preferences);
      // A parent who set their language on the website should find the
      // app already in it -- unless they have since chosen one here.
      adoptProfileLocale(next?.uiLocale);
    } catch {
      // A failed profile fetch is not worth blocking the UI; the credit
      // chip simply shows its last known value.
    }
  }, [api, token, adoptProfileLocale]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    // Order matters: the registration has to be removed while the token
    // is still valid, or the request is rejected and the device keeps
    // receiving another family's notifications.
    await unregisterFromPush(api).catch(() => undefined);
    await supabase().auth.signOut();
    await clearOffline().catch(() => undefined);
    setProfile(null);
    setNotifications(null);
  }, [api]);

  const value = useMemo(
    () => ({
      session,
      profile,
      notifications,
      loading,
      api,
      refreshProfile,
      setNotifications,
      signOut,
    }),
    [session, profile, notifications, loading, api, refreshProfile, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
