import { cn } from '@/lib/utils';

/**
 * Loading indicator.
 *
 * A slowly rotating ring rather than a bouncing dot cluster: the
 * generation waits in this product are 30-90 seconds, and a frantic
 * animation makes a wait feel longer than it is.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-5 animate-spin text-current', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-tile', className)} aria-hidden="true" />;
}
