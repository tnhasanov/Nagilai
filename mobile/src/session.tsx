import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { createApi, type Api, type Profile } from './api';

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
 */
interface SessionValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  api: Api;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = supabase();

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
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
      return;
    }
    try {
      const { profile: next } = await api.me();
      setProfile(next);
    } catch {
      // A failed profile fetch is not worth blocking the UI; the credit
      // chip simply shows its last known value.
    }
  }, [api, token]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, api, refreshProfile, signOut }),
    [session, profile, loading, api, refreshProfile, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}
