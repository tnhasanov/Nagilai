import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Native narration playback.
 *
 * This is the capability that most justifies a native app over a web
 * view: the story keeps playing when the screen locks, which is exactly
 * what a bedtime story needs and what a browser tab cannot do.
 *
 * Two details that only show up on a real device:
 *
 *  - **`interruptionMode` must be `doNotMix` for lock-screen controls.**
 *    Without them Android stops background playback after roughly three
 *    minutes, which for a ten-minute story means it dies in the middle.
 *    `doNotMix` also means other audio pauses rather than ducking, which
 *    for a story being read aloud is the right behaviour anyway.
 *  - **The lock screen has to be told what is playing.** A player that
 *    claims the lock screen without metadata shows a blank card; this
 *    passes the title and the cover.
 */
export interface NarrationTiming {
  pageNumber: number;
  startSeconds: number;
  endSeconds: number;
}

export interface NarrationMetadata {
  title: string;
  /** Shown under the title on the lock screen. */
  subtitle?: string | null;
  artworkUrl?: string | null;
}

export interface NarrationState {
  isPlaying: boolean;
  isLoaded: boolean;
  /** True while the player is buffering rather than stalled. */
  isBuffering: boolean;
  /**
   * Set when playback failed -- a dropped connection mid-stream is the
   * common case, and it deserves a retry button rather than a control bar
   * that silently does nothing.
   */
  error: string | null;
  positionSeconds: number;
  durationSeconds: number;
  currentPage: number | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  reload: () => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  rate: number;
}

export function useNarration(
  url: string | null,
  timings: NarrationTiming[] | null,
  metadata?: NarrationMetadata,
): NarrationState {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [attempt, setAttempt] = useState(0);

  const title = metadata?.title ?? '';
  const subtitle = metadata?.subtitle ?? null;
  const artworkUrl = metadata?.artworkUrl ?? null;

  useEffect(() => {
    let cancelled = false;

    // Background audio has to be requested before a player exists.
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // Required for lock-screen controls, and correct for a story being
      // read aloud: nothing else should be playing over it.
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
      allowsRecording: false,
    }).catch(() => undefined);

    if (!url) {
      setIsLoaded(false);
      return;
    }

    setError(null);

    let player: AudioPlayer;
    try {
      player = createAudioPlayer({ uri: url });
    } catch {
      setError('playback');
      return;
    }

    playerRef.current = player;

    // Claim the lock screen and the notification shade. Without this,
    // Android's OS limit kills background playback after ~3 minutes.
    try {
      player.setActiveForLockScreen(
        true,
        {
          title,
          artist: subtitle ?? undefined,
          // Remote artwork only: a `file://` cover from a downloaded book
          // is not reachable by the system media session.
          artworkUrl: artworkUrl?.startsWith('http') ? artworkUrl : undefined,
        },
        { showSeekForward: true, showSeekBackward: true, isLiveStream: false },
      );
    } catch {
      // Playback still works without lock-screen controls; on Android it
      // will simply stop when backgrounded for long enough.
    }

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (cancelled) return;

      setIsLoaded(status.isLoaded);
      setIsPlaying(status.playing);
      setIsBuffering(Boolean(status.isBuffering) && !status.playing);
      setPosition(status.currentTime ?? 0);
      if (status.duration && Number.isFinite(status.duration)) setDuration(status.duration);

      // A stream that drops mid-story reports an error rather than
      // silently stopping. Surfacing it is what makes the retry honest.
      const reason = (status as { error?: string | null }).error;
      if (reason) setError(reason);
    });

    return () => {
      cancelled = true;
      subscription.remove();
      try {
        player.clearLockScreenControls();
      } catch {
        // Nothing to clear if the claim never succeeded.
      }
      player.remove();
      playerRef.current = null;
      setIsPlaying(false);
      setIsLoaded(false);
      setIsBuffering(false);
      setPosition(0);
    };
  }, [url, attempt, title, subtitle, artworkUrl]);

  const play = useCallback(() => {
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const restart = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    void player.seekTo(0);
    player.play();
    setPosition(0);
    setIsPlaying(true);
  }, []);

  /**
   * Tears the player down and builds a new one.
   *
   * The fix for a stream that died with the connection: `play()` on a
   * failed player does nothing, and only a fresh source recovers.
   */
  const reload = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    void player.seekTo(Math.max(0, seconds));
    setPosition(Math.max(0, seconds));
  }, []);

  const setRate = useCallback((next: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.setPlaybackRate(next);
    setRateState(next);
  }, []);

  /**
   * The page the voice is currently on, so the book can turn itself.
   *
   * Page granularity rather than word: it is what a child actually
   * follows, and it is forgiving of the second or so of drift in the
   * server's duration estimate.
   */
  const currentPage = useMemo(() => {
    if (!timings || timings.length === 0) return null;

    for (const timing of timings) {
      if (position >= timing.startSeconds && position < timing.endSeconds) return timing.pageNumber;
    }
    const last = timings[timings.length - 1];
    return last && position >= last.endSeconds ? last.pageNumber : null;
  }, [timings, position]);

  return {
    isPlaying,
    isLoaded,
    isBuffering,
    error,
    positionSeconds: position,
    durationSeconds: duration,
    currentPage,
    play,
    pause,
    toggle,
    restart,
    reload,
    seekTo,
    setRate,
    rate,
  };
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
