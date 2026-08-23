'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Heart, Loader2, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { toggleFavouriteAction } from '@/features/stories/actions';
import { cn } from '@/lib/utils';
import { format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import type { LibraryCard } from '@/types/domain';

/**
 * The story library (§11).
 *
 * Cards lead with the cover, because that is how anyone recognises a book
 * they have read before. Everything else on the card is secondary: the
 * child it was made for, the language, and how far along it is if it is
 * still being made.
 */
export function LibraryGrid({
  stories,
  strings,
  commonStrings,
  emptyAction,
}: {
  stories: LibraryCard[];
  strings: Dictionary['library'];
  commonStrings: Dictionary['common'];
  emptyAction?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<'all' | 'favourites'>('all');

  const visible = useMemo(
    () => (filter === 'favourites' ? stories.filter((story) => story.isFavourite) : stories),
    [filter, stories],
  );

  if (stories.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title={strings.emptyTitle}
        description={strings.emptyBody}
        action={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="mb-6 flex gap-2">
        {(['all', 'favourites'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
              filter === value
                ? 'bg-ink text-paper'
                : 'bg-paper-sunken text-ink-soft hover:text-ink',
            )}
          >
            {value === 'all' ? strings.filterAll : strings.filterFavourites}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((story) => (
          <StoryCard key={story.id} story={story} strings={strings} commonStrings={commonStrings} />
        ))}
      </ul>
    </>
  );
}

function StoryCard({
  story,
  strings,
  commonStrings,
}: {
  story: LibraryCard;
  strings: Dictionary['library'];
  commonStrings: Dictionary['common'];
}) {
  const [favourite, setFavourite] = useState(story.isFavourite);
  const [pending, startTransition] = useTransition();

  const isBuilding = story.status !== 'ready' && story.status !== 'failed';
  const href = story.status === 'ready' ? `/library/${story.id}` : `/library/${story.id}?progress=1`;

  return (
    <li className="group relative">
      <Link
        href={href}
        className="block overflow-hidden rounded-card border border-line bg-paper-raised shadow-page transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
      >
        <div className="relative aspect-3/4 w-full overflow-hidden bg-paper-sunken">
          {story.coverUrl ? (
            <Image
              src={story.coverUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="aurora flex h-full items-center justify-center">
              {isBuilding ? (
                <Loader2 className="size-6 animate-spin text-ink-faint" aria-hidden="true" />
              ) : (
                <Sparkles className="size-6 text-ink-faint" aria-hidden="true" />
              )}
            </div>
          )}

          {isBuilding ? (
            <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2 text-center text-[0.7rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
              {strings.open}…
            </div>
          ) : null}

          {story.status === 'failed' ? (
            <div className="absolute inset-x-0 bottom-0 bg-rose/85 px-3 py-2 text-center text-[0.7rem] font-bold uppercase tracking-wide text-white">
              {commonStrings.retry}
            </div>
          ) : null}
        </div>

        <div className="p-3.5">
          <h3 className="line-clamp-2 font-display text-[0.95rem] font-bold leading-snug text-ink">
            {story.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-ink-faint">
            {story.childDisplayName ? <span className="font-semibold">{story.childDisplayName}</span> : null}
            {story.pageCount > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{format(strings.pages, { count: story.pageCount })}</span>
              </>
            ) : null}
          </div>

          {story.isShared ? (
            <Badge tone="sage" className="mt-2.5">
              <Share2 />
              {strings.shared}
            </Badge>
          ) : null}
        </div>
      </Link>

      <button
        type="button"
        disabled={pending}
        aria-label={favourite ? strings.unfavourite : strings.favourite}
        onClick={() => {
          setFavourite((value) => !value);
          startTransition(async () => {
            const result = await toggleFavouriteAction(story.id);
            if (result.ok) setFavourite(result.data.isFavourite);
          });
        }}
        className="absolute right-2.5 top-2.5 z-10 rounded-pill bg-paper-raised/85 p-2 text-ink-faint shadow-page backdrop-blur transition-colors hover:text-rose"
      >
        <Heart className={cn('size-4 transition-all', favourite && 'fill-rose text-rose')} />
      </button>
    </li>
  );
}
