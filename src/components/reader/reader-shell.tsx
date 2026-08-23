'use client';

import { useState, useTransition } from 'react';
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
  const [narrationQueued, setNarrationQueued] = useState(
    story.narration !== null && story.narration.status !== 'ready',
  );
  const [, startTransition] = useTransition();

  function requestNarration() {
    setNarrationQueued(true);
    startTransition(async () => {
      const result = await requestNarrationAction({ storyId: story.id, speed: 1 });
      if (!result.ok) {
        setNarrationQueued(false);
        toast.error(result.error.message);
        return;
      }
      toast.success(strings.narrationQueued);
      // The worker writes the audio row; a refresh a few seconds later
      // picks up the signed URL.
      setTimeout(() => router.refresh(), 6000);
    });
  }

  function retryIllustration(illustrationId: string) {
    startTransition(async () => {
      const result = await retryIllustrationAction(story.id, illustrationId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setTimeout(() => router.refresh(), 6000);
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
