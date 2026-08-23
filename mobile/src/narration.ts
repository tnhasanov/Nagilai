import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Native narration playback.
 *
 * This is the capability that most justifies a native app over a web
 * view: `staysActiveInBackground` keeps the story playing when the screen
 * locks, which is exactly what a bedtime story needs and what a browser
 * tab cannot do.
 *
 * `interruptionMode: 'duckOthers'` means an incoming navigation
 * instruction or notification lowers the story rather than killing it.
 */
export interface NarrationTiming {
  pageNumber: number;
  startSeconds: number;
  endSeconds: number;
}

export interface NarrationState {
  isPlaying: boolean;
  isLoaded: boolean;
  positionSeconds: number;
  durationSeconds: number;
  currentPage: number | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  rate: number;
}

export function useNarration(
  url: string | null,
  timings: NarrationTiming[] | null,
): NarrationState {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);

  useEffect(() => {
    let cancelled = false;

    // Background audio has to be requested before a player exists.
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);

    if (!url) {
      setIsLoaded(false);
      return;
    }

    const player = createAudioPlayer({ uri: url });
    playerRef.current = player;

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (cancelled) return;
      setIsLoaded(status.isLoaded);
      setIsPlaying(status.playing);
      setPosition(status.currentTime ?? 0);
      if (status.duration && Number.isFinite(status.duration)) setDuration(status.duration);
    });

    return () => {
      cancelled = true;
      subscription.remove();
      player.remove();
      playerRef.current = null;
      setIsPlaying(false);
      setIsLoaded(false);
      setPosition(0);
    };
  }, [url]);

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
    positionSeconds: position,
    durationSeconds: duration,
    currentPage,
    play,
    pause,
    toggle,
    restart,
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
