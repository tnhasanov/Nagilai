'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, BookOpen, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { retryStoryAction } from '@/features/stories/actions';
import { GENERATION_POLL_INTERVAL_MS, GENERATION_POLL_TIMEOUT_MS } from '@/config/constants';
import { cn } from '@/lib/utils';
import { HeroBook } from '@/components/marketing/hero-book';
import type { Dictionary } from '@/i18n';

interface Progress {
  status: string;
  statusMessage: string | null;
  failureReason: string | null;
  percent: number;
  totalIllustrations: number;
  readyIllustrations: number;
}

/**
 * The generation waiting room (§27, §32).
 *
 * "Show progress elegantly" means, concretely: name the stage in words a
 * parent understands, show real movement rather than an indeterminate
 * spinner, and say plainly that they may leave — because they will, and
 * the job keeps running either way.
 *
 * Polling rather than a socket: this is one request every couple of
 * seconds for at most a few minutes, and a persistent connection per
 * waiting parent is not worth the operational cost on serverless.
 */
export function GenerationProgress({
  storyId,
  initial,
  strings,
  commonStrings,
}: {
  storyId: string;
  initial: Progress;
  strings: Dictionary['progress'];
  commonStrings: Dictionary['common'];
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (progress.status === 'ready' || progress.status === 'failed') return;

    const startedAt = Date.now();
    let cancelled = false;

    const timer = setInterval(async () => {
      if (cancelled || Date.now() - startedAt > GENERATION_POLL_TIMEOUT_MS) {
        clearInterval(timer);
        return;
      }

      try {
        const response = await fetch(`/api/stories/${storyId}/progress`, { cache: 'no-store' });
        if (!response.ok) return;

        const next = (await response.json()) as Progress;
        if (cancelled) return;

        setProgress(next);
        if (next.status === 'ready') {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // A dropped poll is not worth surfacing; the next tick retries.
      }
    }, GENERATION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [progress.status, router, storyId]);

  const steps = [
    { key: 'writing', label: strings.writing, done: progress.percent >= 30, active: progress.status === 'generating_text' },
    {
      key: 'painting',
      label: strings.painting,
      done: progress.percent >= 95,
      active: progress.status === 'generating_images',
    },
    { key: 'ready', label: strings.ready, done: progress.status === 'ready', active: false },
  ];

  /*
   * The stage, in the parent's language.
   *
   * This line used to render `progress.statusMessage` — a string the
   * worker writes into the database in English ("Painting the pictures")
   * — inside an otherwise fully translated screen, with the localised
   * `strings.queued` only reached when the column happened to be null.
   * Keeping it as a fallback would just preserve the bug for whichever
   * statuses set it, so it is gone: the status itself is the fact worth
   * showing, and the dictionary already has a phrase for each one.
   */
  const stageLabel: Record<string, string> = {
    generating_text: strings.writing,
    text_ready: strings.textReady,
    generating_images: strings.painting,
    images_ready: strings.painting,
    generating_audio: strings.recording,
    ready: strings.ready,
  };

  if (progress.status === 'failed') {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-pill bg-rose-soft text-rose">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{strings.failed}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{progress.failureReason ?? strings.failedBody}</p>
        <Button
          className="mt-7"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            const result = await retryStoryAction(storyId);
            if (result.ok) {
              setProgress({ ...progress, status: 'queued', percent: 5, failureReason: null });
            }
            setRetrying(false);
          }}
        >
          {retrying ? <Spinner /> : null}
          {commonStrings.retry}
        </Button>
      </div>
    );
  }

  if (progress.status === 'ready') {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="relative mx-auto mb-5 w-fit animate-pop">
          <div className="flex size-14 items-center justify-center rounded-pill bg-sage-soft text-sage">
            <Check className="size-6" />
          </div>
          {/* A quiet celebration: three sparkles swaying around the tick,
              staggered so they read as drifting rather than blinking. */}
          <Sparkles className="absolute -left-7 -top-2 size-4 animate-sway text-amber" aria-hidden="true" />
          <Sparkles
            className="absolute -right-8 top-1 size-5 animate-sway text-plum"
            style={{ animationDelay: '1.2s' }}
            aria-hidden="true"
          />
          <Sparkles
            className="absolute -bottom-3 -right-4 size-3.5 animate-sway text-rose"
            style={{ animationDelay: '2.4s' }}
            aria-hidden="true"
          />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{strings.ready}</h1>
        <Button className="mt-7" onClick={() => router.refresh()}>
          <BookOpen />
          {strings.openBook}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:py-24">
      {/* The book being made, not a sparkle in a circle. This is the
          longest wait in the product and the moment of most anticipation;
          it should look like the thing that is coming. The illustration
          animates itself — twinkling stars, drifting sparkles. */}
      <div className="mx-auto mb-4 w-64 animate-rise sm:w-80" aria-hidden="true">
        <HeroBook />
      </div>

      <h1 className="font-display text-2xl font-bold text-ink">{strings.title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{stageLabel[progress.status] ?? strings.queued}</p>

      <div
        className="mt-8 h-2 w-full overflow-hidden rounded-pill bg-paper-sunken"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-pill bg-amber transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, progress.percent)}%` }}
        />
      </div>

      <ul className="mt-8 space-y-3 text-left">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-pill border transition-colors',
                step.done
                  ? 'border-sage bg-sage text-on-sage'
                  : step.active
                    ? 'border-amber text-amber'
                    : 'border-line text-ink-faint',
              )}
            >
              {step.done ? <Check className="size-3.5 animate-pop" /> : step.active ? <Spinner className="size-3.5" /> : null}
            </span>
            <span className={cn('text-sm', step.done || step.active ? 'font-semibold text-ink' : 'text-ink-faint')}>
              {step.label}
              {step.key === 'painting' && progress.totalIllustrations > 0 ? (
                <span className="ml-1.5 tabular-nums text-ink-faint">
                  {progress.readyIllustrations}/{progress.totalIllustrations}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs leading-relaxed text-ink-faint">{strings.hint}</p>
    </div>
  );
}
