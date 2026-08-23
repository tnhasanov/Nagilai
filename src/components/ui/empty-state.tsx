import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty state.
 *
 * Used for an empty library, no child profiles and no search results. The
 * mark is a soft amber disc rather than a grey icon box - an empty
 * library should feel like an invitation, not a fault.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      <div className="mb-5 flex size-16 items-center justify-center rounded-pill bg-amber-soft text-amber-deep [&_svg]:size-7">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
