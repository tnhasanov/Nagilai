import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { LibraryGrid } from '@/components/library/library-grid';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/services/supabase/server';
import { listLibrary } from '@/features/stories/queries';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

/**
 * The library (§11, §31).
 *
 * `noindex` is not optional here: this page lists books made for named
 * children and must never appear in a search result.
 */
export const metadata: Metadata = {
  title: 'My Library',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/library');

  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const stories = await listLibrary(user.id);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{t.library.title}</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{t.library.subtitle}</p>
          </div>
          <Button asChild>
            <Link href="/create">
              <Sparkles />
              {t.nav.create}
            </Link>
          </Button>
        </div>

        <LibraryGrid
          stories={stories}
          strings={t.library}
          commonStrings={t.common}
          emptyAction={
            <Button asChild size="lg">
              <Link href="/create">
                <Sparkles />
                {t.library.createFirst}
              </Link>
            </Button>
          }
        />
      </div>
    </Shell>
  );
}
