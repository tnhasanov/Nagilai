import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-6 sm:p-8', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-xl font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1.5 text-sm leading-relaxed text-ink-soft', className)} {...props} />;
}

/** Section heading used across the app and marketing pages. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', 'max-w-2xl', className)}>
      {eyebrow ? (
        <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-amber-deep">{eyebrow}</p>
      ) : null}
      <h2 className="text-balance text-3xl font-bold leading-tight text-ink sm:text-4xl">{title}</h2>
      {description ? (
        <p className={cn('mt-4 text-base leading-relaxed text-ink-soft', align === 'center' && 'mx-auto')}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
