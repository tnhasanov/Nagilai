import { describe, expect, it } from 'vitest';
import { estimateDurationSeconds } from '@/services/audio/openai-speech';
import { estimatePageTimings } from '@/services/jobs/handlers/narration';
import { findPageAt } from '@/components/reader/narration-player';
import { countWords, estimateReadingMinutes, formatDuration, truncate } from '@/lib/utils';

/**
 * Narration timing (§10).
 *
 * The speech API returns no word timings, so page-level timings are
 * apportioned by character count. The behaviour that matters for the
 * reader: the windows are contiguous, they cover the whole audio, and
 * they map monotonically to pages — a drifting or overlapping timeline
 * would make the book jump back and forth while the voice is speaking.
 */

const PAGES = [
  { pageNumber: 1, text: 'a'.repeat(100) },
  { pageNumber: 2, text: 'b'.repeat(200) },
  { pageNumber: 3, text: 'c'.repeat(100) },
];

describe('page timings', () => {
  const timings = estimatePageTimings(PAGES, 60);

  it('produces one window per page', () => {
    expect(timings).toHaveLength(3);
    expect(timings.map((t) => t.pageNumber)).toEqual([1, 2, 3]);
  });

  it('apportions the duration by how much text is on each page', () => {
    expect(timings[0]!.endSeconds - timings[0]!.startSeconds).toBeCloseTo(15, 1);
    expect(timings[1]!.endSeconds - timings[1]!.startSeconds).toBeCloseTo(30, 1);
    expect(timings[2]!.endSeconds - timings[2]!.startSeconds).toBeCloseTo(15, 1);
  });

  it('starts at zero, ends at the full duration and never overlaps', () => {
    expect(timings[0]!.startSeconds).toBe(0);
    expect(timings.at(-1)!.endSeconds).toBeCloseTo(60, 1);

    for (let i = 1; i < timings.length; i += 1) {
      expect(timings[i]!.startSeconds).toBeCloseTo(timings[i - 1]!.endSeconds, 2);
    }
  });

  it('degrades safely when the duration is unknown', () => {
    const unknown = estimatePageTimings(PAGES, 0);
    expect(unknown.every((t) => t.startSeconds === 0 && t.endSeconds === 0)).toBe(true);
  });

  it('handles an empty book without dividing by zero', () => {
    expect(estimatePageTimings([], 60)).toEqual([]);
  });
});

describe('mapping audio position to a page', () => {
  const timings = estimatePageTimings(PAGES, 60);

  it('finds the page playing at a given moment', () => {
    expect(findPageAt(timings, 0)).toBe(1);
    expect(findPageAt(timings, 10)).toBe(1);
    expect(findPageAt(timings, 20)).toBe(2);
    expect(findPageAt(timings, 50)).toBe(3);
  });

  it('stays on the last page past the end rather than snapping to the cover', () => {
    expect(findPageAt(timings, 120)).toBe(3);
  });

  it('returns null when there are no timings to consult', () => {
    expect(findPageAt([], 5)).toBeNull();
  });
});

describe('duration estimation', () => {
  it('grows with the amount of text', () => {
    const short = estimateDurationSeconds('a'.repeat(140), 1);
    const long = estimateDurationSeconds('a'.repeat(1400), 1);

    expect(short).toBeCloseTo(10, 0);
    expect(long).toBeCloseTo(100, 0);
  });

  it('shrinks as playback speed rises', () => {
    expect(estimateDurationSeconds('a'.repeat(1400), 2)).toBeLessThan(
      estimateDurationSeconds('a'.repeat(1400), 1),
    );
  });

  it('never reports zero for real text', () => {
    expect(estimateDurationSeconds('Salam', 1)).toBeGreaterThan(0);
  });
});

describe('reading helpers', () => {
  it('counts words across the launch languages, including diacritics', () => {
    expect(countWords('Miray ulduzlara baxdı və bir işıq gördü.')).toBe(7);
    expect(countWords('Мирай подняла глаза — и одна звезда мигнула ей.')).toBe(8);
    expect(countWords('   ')).toBe(0);
  });

  it('estimates reading time from a word count', () => {
    expect(estimateReadingMinutes(110)).toBe(1);
    expect(estimateReadingMinutes(550)).toBe(5);
    expect(estimateReadingMinutes(0)).toBe(1);
  });

  it('formats an audio position', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });

  it('truncates with an ellipsis only when needed', () => {
    expect(truncate('short', 20)).toBe('short');
    expect(truncate('a'.repeat(30), 10)).toHaveLength(10);
    expect(truncate('a'.repeat(30), 10).endsWith('…')).toBe(true);
  });
});
