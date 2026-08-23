import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-paper-sunken text-ink-soft',
        amber: 'bg-amber-soft text-amber-deep',
        plum: 'bg-plum-soft text-plum',
        sage: 'bg-sage-soft text-sage',
        rose: 'bg-rose-soft text-rose',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
