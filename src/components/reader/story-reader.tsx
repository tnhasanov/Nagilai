'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { NarrationPlayer } from './narration-player';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import type { ReaderPage, ReaderStory } from '@/types/domain';

/**
 * The digital book reader (§9).
 *
 * Explicitly not "a webpage with a block of text". The decisions that
 * make it read as a book:
 *
 *  - A spread, not a scroll. One moment is on screen at a time, the way a
 *    picture book works, and turning is a deliberate act.
 *  - The layout changes shape rather than shrinking (§29). On a phone it
 *    is a single portrait page with the picture above the words; on a
 *    tablet or desktop it is a bound two-page spread with a spine.
 *  - The turn animation lifts and slides the leaf. Fast enough not to be
 *    in the way, slow enough to register as a page rather than a swap.
 *  - Everything a reader might reach for works: arrow keys, swipe,
 *    clicking the page edges, and the narration turning pages by itself.
 */
export function StoryReader({
  story,
  strings,
  onRequestNarration,
  onRetryIllustration,
  narrationQueued,
}: {
  story: ReaderStory;
  strings: Dictionary['reader'];
  onRequestNarration?: () => void;
  onRetryIllustration?: (illustrationId: string) => void;
  narrationQueued?: boolean;
}) {
  /* Index 0 is the cover; 1..n are the story pages; the last index is the
     closing page. Keeping them in one sequence means the turn animation
     and the keyboard handling do not need to special-case anything. */
  const totalSpreads = story.pages.length + 2;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.max(0, Math.min(totalSpreads - 1, next));
        if (clamped === current) return current;
        setDirection(clamped > current ? 'forward' : 'back');
        return clamped;
      });
    },
    [totalSpreads],
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrevious = useCallback(() => goTo(index - 1), [goTo, index]);

  /* Keyboard: arrows and space, plus Home/End for the impatient. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          goPrevious();
          break;
        case 'Home':
          event.preventDefault();
          goTo(0);
          break;
        case 'End':
          event.preventDefault();
          goTo(totalSpreads - 1);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious, goTo, totalSpreads]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await containerRef.current?.requestFullscreen().catch(() => undefined);
    }
  }

  /* Swipe. A generous horizontal threshold and a vertical guard, so
     scrolling the long-text page never turns it by accident. */
  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    if (deltaX < 0) goNext();
    else goPrevious();
  }

  /* Narration drives the page: page 1 of the story is spread index 1. */
  const handleNarrationPage = useCallback(
    (pageNumber: number) => {
      goTo(pageNumber);
    },
    [goTo],
  );

  const isCover = index === 0;
  const isClosing = index === totalSpreads - 1;
  const page: ReaderPage | undefined = story.pages[index - 1];

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col',
        // Fill the viewport (less the header and toolbar) so the control
        // bar rests at the bottom of the screen rather than floating in
        // the middle of a short page.
        isFullscreen ? 'h-dvh bg-paper' : 'min-h-[calc(100svh-9rem)]',
      )}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ---- Reading progress ------------------------------------- */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-2 sm:px-6">
        <div className="h-1 w-full overflow-hidden rounded-pill bg-paper-sunken" aria-hidden="true">
          <div
            className="h-full rounded-pill bg-amber transition-[width] duration-500 ease-out"
            style={{ width: `${((index + 1) / totalSpreads) * 100}%` }}
          />
        </div>
      </div>

      {/* ---- The book --------------------------------------------- */}
      <div className="flex flex-1 items-center justify-center px-2 py-4 sm:px-6 sm:py-8">
        <div className="relative mx-auto flex w-full max-w-6xl items-center justify-center">
        <button
          type="button"
          onClick={goPrevious}
          disabled={index === 0}
          aria-label={strings.previous}
          className="absolute left-0 z-20 hidden size-11 items-center justify-center rounded-pill bg-paper-raised/90 text-ink-soft shadow-page backdrop-blur transition-all hover:text-amber-deep disabled:opacity-0 sm:flex"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div
          key={index}
          className={cn(
            'w-full max-w-5xl px-0 sm:px-14 [perspective:2000px]',
            direction === 'forward' ? 'animate-turn-next' : 'animate-turn-back',
          )}
        >
          {isCover ? (
            <CoverSpread story={story} strings={strings} />
          ) : isClosing ? (
            <ClosingSpread story={story} strings={strings} onReadAgain={() => goTo(0)} />
          ) : page ? (
            <PageSpread
              page={page}
              story={story}
              strings={strings}
              total={story.pages.length}
              onRetryIllustration={onRetryIllustration}
            />
          ) : null}
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={index === totalSpreads - 1}
          aria-label={strings.next}
          className="absolute right-0 z-20 hidden size-11 items-center justify-center rounded-pill bg-paper-raised/90 text-ink-soft shadow-page backdrop-blur transition-all hover:text-amber-deep disabled:opacity-0 sm:flex"
        >
          <ChevronRight className="size-5" />
        </button>
        </div>
      </div>

      {/* ---- Controls ---------------------------------------------- */}
      <div className="pb-safe sticky bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2 sm:hidden">
            <Button variant="secondary" size="icon" onClick={goPrevious} disabled={index === 0} aria-label={strings.previous}>
              <ChevronLeft />
            </Button>
            <span className="flex-1 text-center text-xs font-semibold tabular-nums text-ink-faint">
              {isCover
                ? strings.cover
                : isClosing
                  ? strings.theEnd
                  : format(strings.page, { current: index, total: story.pages.length })}
            </span>
            <Button
              variant="secondary"
              size="icon"
              onClick={goNext}
              disabled={index === totalSpreads - 1}
              aria-label={strings.next}
            >
              <ChevronRight />
            </Button>
          </div>

          <NarrationPlayer
            narration={story.narration}
            strings={strings}
            onPageChange={handleNarrationPage}
            {...(onRequestNarration ? { onRequestNarration } : {})}
            {...(narrationQueued !== undefined ? { isQueued: narrationQueued } : {})}
            className="min-w-0 flex-1"
          />

          <div className="hidden items-center gap-3 sm:flex">
            <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink-faint">
              {isCover
                ? strings.cover
                : isClosing
                  ? strings.theEnd
                  : format(strings.page, { current: index, total: story.pages.length })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? strings.exitFullscreen : strings.fullscreen}
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */

function CoverSpread({ story, strings }: { story: ReaderStory; strings: Dictionary['reader'] }) {
  return (
    <article className="mx-auto max-w-md overflow-hidden rounded-card border border-line bg-paper-raised shadow-book">
      <div className="relative aspect-[3/4] w-full bg-paper-sunken">
        {story.cover?.url ? (
          <Image
            src={story.cover.url}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 448px"
            className="object-cover"
          />
        ) : (
          <div className="aurora flex h-full items-center justify-center" aria-hidden="true" />
        )}

        {/* The title band, as on the printed cover. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/55 to-transparent p-6 pt-16">
          <h1 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">{story.title}</h1>
          {story.childDisplayName ? (
            <p className="mt-2 text-sm font-medium text-white/85">{story.childDisplayName}</p>
          ) : null}
        </div>
      </div>

      {story.dedication ? (
        <p className="border-t border-line px-6 py-5 text-center font-display text-sm italic leading-relaxed text-ink-soft">
          {story.dedication}
        </p>
      ) : null}

      <p className="sr-only">{strings.cover}</p>
    </article>
  );
}

function PageSpread({
  page,
  story,
  strings,
  total,
  onRetryIllustration,
}: {
  page: ReaderPage;
  story: ReaderStory;
  strings: Dictionary['reader'];
  total: number;
  onRetryIllustration?: (illustrationId: string) => void;
}) {
  const hasImage = Boolean(page.illustration?.url);
  /* Alternating the picture between the left and right leaf is what stops
     a long book from feeling like a template. */
  const imageOnLeft = page.pageNumber % 2 === 1;

  return (
    <article className="relative mx-auto overflow-hidden rounded-card border border-line bg-paper-raised shadow-book">
      <div className={cn('grid md:grid-cols-2', !hasImage && 'md:grid-cols-1')}>
        {hasImage ? (
          <div
            className={cn(
              'relative aspect-4/3 w-full bg-paper-sunken md:aspect-auto md:min-h-[30rem]',
              imageOnLeft ? 'md:order-1' : 'md:order-2',
            )}
          >
            {page.illustration?.url ? (
              <Image
                src={page.illustration.url}
                alt={`Illustration for page ${page.pageNumber}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            ) : null}
          </div>
        ) : page.illustration && page.illustration.status === 'failed' ? (
          <div className="flex aspect-4/3 flex-col items-center justify-center gap-3 bg-paper-sunken p-6 text-center md:order-1 md:aspect-auto">
            <ImageOff className="size-7 text-ink-faint" aria-hidden="true" />
            <p className="text-sm text-ink-faint">{strings.illustrationFailed}</p>
            {onRetryIllustration && page.illustration ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRetryIllustration(page.illustration!.id)}
              >
                <RefreshCw />
                {strings.retryIllustration}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            'relative flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12',
            hasImage && (imageOnLeft ? 'md:order-2' : 'md:order-1'),
          )}
        >
          {/* The spine shadow, only where two leaves actually meet. */}
          {hasImage ? (
            <span
              aria-hidden="true"
              className={cn(
                'book-spine absolute inset-y-0 hidden w-8 md:block',
                imageOnLeft ? '-left-4' : '-right-4',
              )}
            />
          ) : null}

          <p className="prose-story measure">{page.text}</p>

          <p className="mt-8 text-center text-xs font-semibold tabular-nums text-ink-faint">
            {page.pageNumber} / {total}
          </p>
        </div>
      </div>

      <span className="sr-only">{story.title}</span>
    </article>
  );
}

function ClosingSpread({
  story,
  strings,
  onReadAgain,
}: {
  story: ReaderStory;
  strings: Dictionary['reader'];
  onReadAgain: () => void;
}) {
  return (
    <article className="mx-auto max-w-2xl overflow-hidden rounded-card border border-line bg-paper-raised px-6 py-14 text-center shadow-book sm:px-12">
      {/* The last page of a bedtime book deserves a sky. Two stars
          twinkling beside the words, on offsets so they breathe rather
          than blink together. */}
      <div className="relative mx-auto w-fit">
        <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">{strings.theEnd}</h2>
        <Sparkles
          className="absolute -left-9 top-0 size-4 animate-twinkle text-amber"
          aria-hidden="true"
        />
        <Sparkles
          className="absolute -right-9 bottom-0 size-3.5 animate-twinkle text-plum"
          style={{ animationDelay: '1.6s' }}
          aria-hidden="true"
        />
      </div>
      <div className="mx-auto mt-5 h-px w-14 bg-amber" aria-hidden="true" />

      {story.educationalTakeaway || story.discussionQuestions.length > 0 ? (
        <div className="mt-10 rounded-card bg-paper-sunken px-6 py-7 text-left">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-amber-deep">
            {strings.forGrownUps}
          </p>

          {story.educationalTakeaway ? (
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink">{story.educationalTakeaway}</p>
          ) : null}

          {story.discussionQuestions.length > 0 ? (
            <>
              <p className="mt-6 text-sm font-bold text-ink">{strings.talkAbout}</p>
              <ul className="mt-2 space-y-2">
                {story.discussionQuestions.map((question) => (
                  <li key={question} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-2 size-1.5 shrink-0 rounded-pill bg-amber" aria-hidden="true" />
                    {question}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* The book used to stop here. A child who has just finished
          something they are in wants it again, and a parent wants back
          to where the rest of them live; neither had anywhere to go
          except the browser's back button. */}
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" onClick={onReadAgain}>
          <RotateCcw />
          {strings.readAgain}
        </Button>
        {/* Only for the owner. A visitor reading a shared book has no
            library to go back to, and `ownerControls` is exactly how the
            share page proves it renders no owner affordances. */}
        {story.ownerControls ? (
          <Button variant="secondary" size="lg" asChild>
            <Link href="/library">{strings.backToLibrary}</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
