import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * The press interaction is a small downward translate rather than a scale
 * or an opacity change — it reads as pressing a physical thing, which is
 * the tactile register the whole product is aiming for.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /* `action`, not `amber`: the accent and the fill are different
           jobs and only one of them has to carry text. See globals.css. */
        primary:
          'bg-action text-on-action shadow-[0_2px_0_0_var(--color-action-hover),0_10px_24px_-12px_rgba(217,126,40,0.7)] hover:bg-action-hover active:shadow-[0_1px_0_0_var(--color-action-hover)]',
        secondary:
          'bg-paper-raised text-ink border border-line-strong shadow-page hover:border-amber hover:text-amber-deep',
        ghost: 'text-ink-soft hover:bg-paper-sunken hover:text-ink',
        plum: 'bg-plum text-white shadow-[0_2px_0_0_rgba(40,30,60,0.6)] hover:opacity-90',
        danger: 'bg-rose-soft text-rose border border-rose/30 hover:bg-rose hover:text-white',
        link: 'text-amber-deep underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-sm [&_svg]:size-4',
        md: 'h-11 px-6 text-[0.95rem] [&_svg]:size-[1.05rem]',
        lg: 'h-13 px-8 text-base [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-[1.15rem]',
        iconLg: 'size-14 [&_svg]:size-6',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return <Component ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { buttonVariants };
