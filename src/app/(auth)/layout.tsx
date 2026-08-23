import Link from 'next/link';
import { Brand } from '@/components/site/brand';

/**
 * Auth layout.
 *
 * Deliberately quieter than the app shell: one card on warm paper, no
 * navigation to wander off into. The only way out is forward or home.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="aurora flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <Brand />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-rise">{children}</div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-ink-faint sm:px-6">
        <Link href="/privacy" className="hover:text-ink-soft">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-ink-soft">
          Terms
        </Link>
      </footer>
    </div>
  );
}
