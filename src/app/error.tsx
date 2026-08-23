'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Application error boundary (§32).
 *
 * A parent sees a calm sentence, never a stack trace or a provider
 * message. The digest is what an administrator correlates with the server
 * logs, so it is shown small rather than hidden entirely.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">
        Something went wrong at our end. We have been told about it.
      </h1>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-soft">
        Nothing you made has been lost. Please try again in a moment.
      </p>

      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          {/* A full page load, not a client navigation: the boundary is
              here because client state is already broken, and routing
              within it would land in the same broken state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/library">My Library</a>
        </Button>
      </div>

      {error.digest ? (
        <p className="mt-8 font-mono text-[0.7rem] text-ink-faint">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
