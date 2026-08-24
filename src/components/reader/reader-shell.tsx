'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { StoryReader } from './story-reader';
import { requestNarrationAction, retryIllustrationAction } from '@/features/stories/actions';
import type { Dictionary } from '@/i18n';
import type { ReaderStory } from '@/types/domain';

/**
 * Wires the reader to its server actions.
 *
 * Kept separate from `StoryReader` so the reader itself stays a pure
 * presentation component — the share page renders exactly the same
 * component with no actions attached, which is how a visitor provably
 * gets no owner controls.
 *
 * It is also what waits for work the worker is still doing. That used to
 * be a single `router.refresh()` six seconds after the request, which is
 * a guess, and for narration a wrong one: reading a ten-page book aloud
 * takes far longer than six seconds, so "Preparing the narration…" span
 * until the parent reloaded the page by hand. `narrationQueued` was also
 * seeded once from the initial props and never cleared, so even the
 * refresh that *did* bring back finished audio left the spinner up.
 *
 * Both are now derived from what the server last said, and polled until
 * it says something different.
 */
export function ReaderShell({
  story,
  strings,
  canNarrate,
}: {
  story: ReaderStory;
  strings: Dictionary['reader'];
  canNarrate: boolean;
}) {
  const router = useRouter();
  /* Set on request, cleared by the server telling us how it went. */
  const [justRequested, setJustRequested] = useState(false);
  const [, startTransition] = useTransition();

  const narrationSettled =
    story.narration !== null &&
    (story.narration.status === 'ready' ||
      story.narration.status === 'failed' ||
      story.narration.status === 'skipped');
  const narrationQueued = !narrationSettled && (justRequested || story.narration !== null);

  /* An illustration a parent has just retried is the other thing worth
     waiting on, and it used the same single-shot refresh. */
  const illustrationsPending = [story.cover, ...story.pages.map((page) => page.illustration)].some(
    (illustration) =>
      illustration !== null &&
      (illustration.status === 'pending' || illustration.status === 'generating'),
  );

  useWaitForWorker(narrationQueued || illustrationsPending, () => router.refresh());

  function requestNarration() {
    setJustRequested(true);
    startTransition(async () => {
      const result = await requestNarrationAction({ storyId: story.id, speed: 1 });
      if (!result.ok) {
        setJustRequested(false);
        toast.error(result.error.message);
        return;
      }
      toast.success(strings.narrationQueued);
      // The polling above takes it from here.
      router.refresh();
    });
  }

  function retryIllustration(illustrationId: string) {
    startTransition(async () => {
      const result = await retryIllustrationAction(story.id, illustrationId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <StoryReader
      story={story}
      strings={strings}
      narrationQueued={narrationQueued}
      onRetryIllustration={retryIllustration}
      {...(canNarrate ? { onRequestNarration: requestNarration } : {})}
    />
  );
}

/**
 * Asks the server again until it has something new to say.
 *
 * Bounded rather than indefinite: generation that has not finished in a
 * few minutes has gone wrong somewhere the reader cannot fix, and a tab
 * left open overnight should not keep refreshing a page nobody is
 * looking at. When the budget runs out the poll simply stops — the
 * status the parent can see is still the true one, and reloading works.
 *
 * The interval widens as it goes, because the first few seconds are when
 * a fast job lands and the later minutes are just waiting.
 */
function useWaitForWorker(active: boolean, refresh: () => void): void {
  useEffect(() => {
    if (!active) return;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      attempt += 1;
      if (attempt > MAX_POLLS) return;
      refresh();
      timer = setTimeout(tick, delayFor(attempt));
    };

    timer = setTimeout(tick, delayFor(0));
    return () => clearTimeout(timer);
    // `refresh` is a fresh closure each render; the poll is keyed on
    // whether there is anything to wait for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

const MAX_POLLS = 40;

/** 3s while a quick job might land, easing out to 10s. */
function delayFor(attempt: number): number {
  return Math.min(3000 + attempt * 500, 10_000);
}
