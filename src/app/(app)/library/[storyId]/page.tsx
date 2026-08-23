import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { ReaderShell } from '@/components/reader/reader-shell';
import { GenerationProgress } from '@/components/reader/generation-progress';
import { StoryActions } from '@/components/reader/story-actions';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/services/supabase/server';
import { getReaderStory, getStoryProgress } from '@/features/stories/queries';
import { getShareState } from '@/features/sharing/actions';
import { getCatalogue } from '@/features/stories/catalogue';
import { getSetting } from '@/services/config/settings';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS } from '@/config/constants';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';
import { isAppError } from '@/lib/errors';

/**
 * The story page.
 *
 * One route serves two states: the waiting room while generation is in
 * flight, and the book once it is ready. Same URL, so the link a parent
 * bookmarks the moment they press Create keeps working.
 */
export const metadata: Metadata = {
  title: 'Story',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function StoryPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/library/${storyId}`);

  const locale = await resolveLocale();
  const t = getDictionary(locale);

  let story;
  try {
    story = await getReaderStory(user.id, storyId);
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  }

  if (story.status !== 'ready') {
    const progress = await getStoryProgress(user.id, storyId);
    return (
      <Shell showFooter={false}>
        <BackLink label={t.nav.library} />
        <GenerationProgress
          storyId={storyId}
          initial={progress}
          strings={t.progress}
          commonStrings={t.common}
        />
      </Shell>
    );
  }

  const [shareState, catalogue, features] = await Promise.all([
    getShareState(storyId),
    getCatalogue(locale),
    getSetting('features'),
  ]);

  await capture({
    name: ANALYTICS_EVENTS.storyOpened,
    ownerId: user.id,
    properties: { language: story.languageCode, theme: story.themeSlug, pages: story.pages.length },
  });

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink label={t.nav.library} inline />
          <StoryActions
            storyId={storyId}
            title={story.title}
            shareState={features.sharing_enabled ? shareState : null}
            languages={catalogue.languages}
            strings={{ library: t.library, share: t.share, remix: t.remix, common: t.common }}
          />
        </div>
      </div>

      <ReaderShell story={story} strings={t.reader} canNarrate={features.narration_enabled} />
    </Shell>
  );
}

function BackLink({ label, inline }: { label: string; inline?: boolean }) {
  const link = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/library">
        <ChevronLeft />
        {label}
      </Link>
    </Button>
  );

  if (inline) return link;
  return <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">{link}</div>;
}
