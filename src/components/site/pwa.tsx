'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabaseBrowser } from '@/services/supabase/client';

/**
 * Progressive web app plumbing.
 *
 * Three jobs, all of which have to happen on the client:
 *
 *  1. Register the service worker, and take a waiting update on the next
 *     navigation rather than reloading under the parent mid-story.
 *  2. Wipe the private media cache the moment a session ends. Nagilai is
 *     installed on shared family devices; a cached illustration outliving
 *     its sign-out would be a real leak, so this is the safeguard that
 *     makes offline media caching acceptable at all.
 *  3. Offer to install, once, without nagging.
 */
export function ProgressiveWebApp() {
  useServiceWorker();
  return <InstallPrompt />;
}

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        // A new worker is waiting: activate it, but let the *next*
        // navigation pick it up. Reloading here would drop a parent out of
        // a book they are reading aloud.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      } catch {
        // A failed registration must never break the page; the app works
        // perfectly well without a worker.
      }
    };

    void register();

    const supabase = supabaseBrowser();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHES' });
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);
}

const DISMISSED_KEY = 'nagilai_install_dismissed';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Already installed, or previously dismissed.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    try {
      if (window.localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Private browsing can throw on access; treat it as "not dismissed".
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      // A beat of delay, so the banner does not land on top of the first
      // paint of the page the parent actually came for.
      window.setTimeout(() => setVisible(true), 4000);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* nothing to remember, nothing to do */
    }
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Nagilai"
      className="pb-safe fixed inset-x-0 bottom-0 z-50 px-4 pb-4 animate-rise sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <div className="card flex items-center gap-4 p-4 shadow-lift">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-amber-soft text-amber-deep">
          <Download className="size-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Add Nagilai to your home screen</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Opens full screen, and books you have read stay available offline.
          </p>
        </div>

        <Button
          size="sm"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            dismiss();
          }}
        >
          Install
        </Button>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="rounded-pill p-1.5 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
