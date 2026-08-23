import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { Brand } from '@/components/site/brand';
import { StoryReader } from '@/components/reader/story-reader';
import { Button } from '@/components/ui/button';
import { getSharedStory, recordShareView } from '@/features/sharing/queries';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

/**
 * The public share page (§21, §31).
 *
 * Three things make this safe to hand to a grandparent:
 *
 *  - It reads through `get_shared_story()`, which returns a redacted
 *    document. Nothing about the child beyond a display name exists in
 *    this render, so there is nothing for a bug to leak.
 *  - It renders `StoryReader` with no action handlers at all, so a
 *    visitor has no owner controls to find.
 *  - It is `noindex` unless the owner explicitly opted in, and the
 *    metadata is generated per-link rather than statically.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedStory(token);

  if (!shared) {
    return { title: 'Story', robots: { index: false, follow: false } };
  }

  const { story, allowIndexing } = shared;

  return {
    title: story.title,
    description: story.summary ?? 'A personalised storybook made with Nagilai.',
    // Conservative by default (§31): a shared book is unlisted unless the
    // parent deliberately made it public.
    robots: allowIndexing
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    openGraph: {
      type: 'article',
      title: story.title,
      description: story.summary ?? undefined,
      ...(story.cover?.url ? { images: [{ url: story.cover.url }] } : {}),
    },
    alternates: { canonical: `/share/${token}` },
  };
}

export default async function SharedStoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const shared = await getSharedStory(token);
  if (!shared) notFound();

  await recordShareView(token);

  const locale = await resolveLocale();
  const t = getDictionary(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <span className="hidden rounded-pill bg-sage-soft px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-sage sm:inline">
            {t.share.sharedBadge}
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* No action handlers are passed, so this render has no narration
            request, no retry and no owner toolbar. */}
        <StoryReader story={shared.story} strings={t.reader} />
      </main>

      <footer className="border-t border-line bg-paper-sunken/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-12 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {t.share.madeWith}
          </p>
          <h2 className="text-balance font-display text-2xl font-bold text-ink sm:text-3xl">
            {t.share.makeYourOwn}
          </h2>
          <Button asChild size="lg" className="mt-2">
            <Link href="/">
              {t.landing.ctaPrimary}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
