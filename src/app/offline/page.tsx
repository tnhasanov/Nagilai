import Link from 'next/link';
import { CloudOff } from 'lucide-react';
import type { Metadata } from 'next';
import { Brand } from '@/components/site/brand';
import { Button } from '@/components/ui/button';

/**
 * The offline screen.
 *
 * Served by the service worker when a navigation fails. Deliberately
 * static and dependency-free - it has to render from cache with no
 * network, no session and no database.
 */
export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="aurora flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Brand className="mb-10" />

      <div className="mb-6 flex size-16 items-center justify-center rounded-pill bg-paper-sunken text-ink-faint">
        <CloudOff className="size-7" aria-hidden="true" />
      </div>

      <h1 className="font-display text-2xl font-bold text-ink">You are offline</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-soft">
        Nagilai needs a connection to write a new story. Books you have already opened are still
        readable - try your library.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/library">My Library</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
