'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatDuration } from '@/lib/utils';
import type { NarrationTiming, ReaderNarration } from '@/types/domain';
import type { Dictionary } from '@/i18n';

/**
 * Narration player (§10).
 *
 * Controls the specification asks for: play, pause, resume, restart, a
 * scrubbable progress bar, elapsed/total time and playback speed.
 *
 * The part that makes it feel like being read to rather than like an
 * audio file is `onPageChange`: the stored per-page timings are used to
 * turn the page as the voice reaches it. The audio leads, the book
 * follows.
 */
export function NarrationPlayer({
  narration,
  strings,
  onPageChange,
  onRequestNarration,
  isQueued,
  className,
}: {
  narration: ReaderNarration | null;
  strings: Dictionary['reader'];
  onPageChange?: (pageNumber: number) => void;
  onRequestNarration?: () => void;
  isQueued?: boolean;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(narration?.durationSeconds ?? 0);
  const [speed, setSpeed] = useState(1);
  const lastPageRef = useRef<number | null>(null);

  const timings = narration?.timings ?? null;

  /* Keeps the visible page in step with the audio position. */
  const syncPage = useCallback(
    (time: number) => {
      if (!timings || !onPageChange) return;
      const active = findPageAt(timings, time);
      if (active !== null && active !== lastPageRef.current) {
        lastPageRef.current = active;
        onPageChange(active);
      }
    },
    [timings, onPageChange],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setCurrentTime(audio.currentTime);
      syncPage(audio.currentTime);
    };
    const onLoaded = () => setDuration(audio.duration || narration?.durationSeconds || 0);
    const onEnd = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnd);
    };
  }, [narration?.durationSeconds, syncPage]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  /* No audio yet: offer to make it, or say it is on its way. */
  if (!narration || narration.status !== 'ready' || !narration.url) {
    return (
      <div className={className}>
        <Button
          variant="secondary"
          size="lg"
          onClick={onRequestNarration}
          disabled={isQueued || !onRequestNarration}
          className="w-full sm:w-auto"
        >
          {isQueued ? <Spinner /> : <Play />}
          {isQueued ? strings.preparing : strings.listen}
        </Button>
        {isQueued ? <p className="mt-2 text-xs text-ink-faint">{strings.narrationQueued}</p> : null}
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function restart() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    lastPageRef.current = null;
    void audio.play();
    setIsPlaying(true);
  }

  function seek(fraction: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = Math.min(duration, Math.max(0, fraction * duration));
    setCurrentTime(audio.currentTime);
    lastPageRef.current = null;
    syncPage(audio.currentTime);
  }

  return (
    <div className={className}>
      <audio ref={audioRef} src={narration.url} preload="metadata" />

      <div className="flex items-center gap-3 rounded-pill border border-line bg-paper-raised/95 px-3 py-2 shadow-page backdrop-blur">
        <Button
          variant="primary"
          size="icon"
          onClick={toggle}
          aria-label={isPlaying ? strings.pause : strings.play}
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>

        <button
          type="button"
          onClick={restart}
          aria-label={strings.restart}
          className="rounded-pill p-2 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <RotateCcw className="size-4" />
        </button>

        {/* The scrubber is an input[type=range] so keyboard and screen
            reader users get seeking for free. */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-paper-sunken">
            <div
              className="h-full rounded-pill bg-amber transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 10)}
            onChange={(event) => seek(Number(event.target.value) / 1000)}
            aria-label={strings.play}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <span className="hidden shrink-0 font-mono text-xs tabular-nums text-ink-faint sm:block">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>

        <label className="flex shrink-0 items-center gap-1 text-ink-faint" title={strings.speed}>
          <Gauge className="size-4" aria-hidden="true" />
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            aria-label={strings.speed}
            className="cursor-pointer appearance-none bg-transparent text-xs font-bold text-ink-soft focus:outline-none"
          >
            {[0.75, 1, 1.25, 1.5].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/** The page whose timing window contains `time`. */
export function findPageAt(timings: readonly NarrationTiming[], time: number): number | null {
  for (const timing of timings) {
    if (time >= timing.startSeconds && time < timing.endSeconds) return timing.pageNumber;
  }
  // Past the end of the last window: stay on the final page rather than
  // snapping back to the cover.
  const last = timings[timings.length - 1];
  return last && time >= last.endSeconds ? last.pageNumber : null;
}
