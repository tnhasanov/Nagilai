import { describe, expect, it } from 'vitest';
import { isQuietNow, minuteOfDayIn, storyReadyCopy } from '@/services/notifications';
import { shouldContinue, type WorkerReport } from '@/services/jobs/worker';
import { UI_LOCALES } from '@/config/constants';

/**
 * Notification rules, and the worker's self-continuation.
 *
 * What is worth testing here is not "does an HTTP request go out" — that
 * needs a credential and a device. It is the logic that decides *whether*
 * to send, which is where a bedtime-story app gets embarrassing: a quiet
 * window that wraps past midnight, or a story that tells a parent twelve
 * times because twelve illustration jobs finished.
 */

describe('quiet hours', () => {
  it('is not quiet when no window is set', () => {
    expect(isQuietNow(180, null, null)).toBe(false);
    expect(isQuietNow(180, undefined, undefined)).toBe(false);
  });

  it('handles a window inside one day', () => {
    // 13:00 to 15:00
    expect(isQuietNow(12 * 60, 13 * 60, 15 * 60)).toBe(false);
    expect(isQuietNow(13 * 60, 13 * 60, 15 * 60)).toBe(true);
    expect(isQuietNow(14 * 60, 13 * 60, 15 * 60)).toBe(true);
    expect(isQuietNow(15 * 60, 13 * 60, 15 * 60)).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    // 22:00 to 07:00 — the case a bedtime product actually needs, and the
    // one a naive `from <= now && now < to` gets backwards.
    const from = 22 * 60;
    const to = 7 * 60;

    expect(isQuietNow(21 * 60 + 59, from, to)).toBe(false);
    expect(isQuietNow(22 * 60, from, to)).toBe(true);
    expect(isQuietNow(23 * 60 + 30, from, to)).toBe(true);
    expect(isQuietNow(0, from, to)).toBe(true);
    expect(isQuietNow(3 * 60, from, to)).toBe(true);
    expect(isQuietNow(6 * 60 + 59, from, to)).toBe(true);
    expect(isQuietNow(7 * 60, from, to)).toBe(false);
    expect(isQuietNow(12 * 60, from, to)).toBe(false);
  });

  it('treats an empty window as no window rather than all day', () => {
    expect(isQuietNow(0, 600, 600)).toBe(false);
    expect(isQuietNow(600, 600, 600)).toBe(false);
  });

  it('reads the wall clock in the profile timezone', () => {
    const at = new Date('2026-08-23T21:30:00Z');

    expect(minuteOfDayIn('UTC', at)).toBe(21 * 60 + 30);
    // Baku is UTC+4 year round, so 21:30Z is 01:30 the next day.
    expect(minuteOfDayIn('Asia/Baku', at)).toBe(1 * 60 + 30);
  });

  it('falls back to UTC rather than throwing on a bad timezone', () => {
    const at = new Date('2026-08-23T21:30:00Z');
    expect(minuteOfDayIn('Not/AZone', at)).toBe(21 * 60 + 30);
  });

  it('is quiet at 01:30 in Baku for a 22:00-07:00 window', () => {
    // The whole point, end to end: a story that finishes late at night
    // does not buzz a phone in the bedroom it was made for.
    const minute = minuteOfDayIn('Asia/Baku', new Date('2026-08-23T21:30:00Z'));
    expect(isQuietNow(minute, 22 * 60, 7 * 60)).toBe(true);
  });
});

describe('notification copy', () => {
  it('has a title and body in every interface language', () => {
    for (const locale of UI_LOCALES) {
      const copy = storyReadyCopy(locale, 'The Moon Fox', null);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body).toContain('The Moon Fox');
    }
  });

  it('uses the child variant when a name is known', () => {
    for (const locale of UI_LOCALES) {
      const copy = storyReadyCopy(locale, 'The Moon Fox', 'Aylin');
      expect(copy.body).toContain('Aylin');
      expect(copy.body).toContain('The Moon Fox');
    }
  });

  it('leaves no placeholder unsubstituted', () => {
    for (const locale of UI_LOCALES) {
      const withChild = storyReadyCopy(locale, 'Title', 'Child');
      const withoutChild = storyReadyCopy(locale, 'Title', null);
      expect(withChild.body).not.toMatch(/\{\w+\}/);
      expect(withoutChild.body).not.toMatch(/\{\w+\}/);
    }
  });

  it('is actually translated rather than four copies of English', () => {
    const titles = UI_LOCALES.map((locale) => storyReadyCopy(locale, 'T', null).title);
    expect(new Set(titles).size).toBe(UI_LOCALES.length);
  });
});

describe('worker self-continuation', () => {
  const report = (over: Partial<WorkerReport> = {}): WorkerReport => ({
    claimed: 3,
    succeeded: 3,
    failed: 0,
    reaped: 0,
    durationMs: 100,
    dueRemaining: 5,
    queuedRemaining: 5,
    stoppedBecause: 'job-limit',
    ...over,
  });

  it('continues while work is still due', () => {
    expect(shouldContinue(report(), 0)).toBe(true);
  });

  it('stops when the queue is drained', () => {
    expect(shouldContinue(report({ dueRemaining: 0 }), 0)).toBe(false);
  });

  it('stops when only backing-off jobs remain', () => {
    // Queued but not due: chaining for these would spin until the backoff
    // expires, burning invocations for nothing.
    expect(shouldContinue(report({ dueRemaining: 0, queuedRemaining: 4 }), 0)).toBe(false);
  });

  it('stops when this run claimed nothing', () => {
    // Due work it could not claim means another worker holds it.
    expect(shouldContinue(report({ claimed: 0 }), 0)).toBe(false);
  });

  it('bounds the chain so a pathological queue cannot loop forever', () => {
    expect(shouldContinue(report(), 19)).toBe(true);
    expect(shouldContinue(report(), 20)).toBe(false);
    expect(shouldContinue(report(), 999)).toBe(false);
  });
});
