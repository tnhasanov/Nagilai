'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { clientLocale, getDictionary } from '@/i18n';

/**
 * Application error boundary (§32).
 *
 * A parent sees a calm sentence, never a stack trace or a provider
 * message. The digest is what an administrator correlates with the server
 * logs, so it is shown small rather than hidden entirely.
 *
 * In the parent's language, which took embarrassingly long to arrive:
 * this boundary renders outside every layout and receives no props, so
 * it had simply been written in English — on the one screen a parent
 * only reaches when something has already gone wrong. `clientLocale`
 * reads the same cookie the server does.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getDictionary(clientLocale());

  useEffect(() => {
    console.error('[boundary]', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">{t.common.errorTitle}</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-soft">{t.common.errorBody}</p>

      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>{t.common.retry}</Button>
        <Button variant="secondary" asChild>
          {/* A full page load, not a client navigation: the boundary is
              here because client state is already broken, and routing
              within it would land in the same broken state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/library">{t.nav.library}</a>
        </Button>
      </div>

      {error.digest ? (
        <p className="mt-8 font-mono text-[0.7rem] text-ink-faint">
          {t.common.errorReference}: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
