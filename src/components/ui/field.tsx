import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/**
 * Form field primitives.
 *
 * Inputs sit on sunken paper with a soft inner edge rather than a hard
 * box, and focus warms the border to amber instead of the browser blue —
 * consistent with the rest of the surface.
 */

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('block text-sm font-semibold text-ink', className)}
      {...props}
    />
  );
});

/*
 * Two things here are load-bearing and were previously wrong.
 *
 * **16px, not 15.2px.** iOS Safari zooms the whole page in when a focused
 * input's font is under 16px, and then leaves you zoomed. Every form in
 * the app did that on every field, on the device most parents use.
 *
 * **No `outline-none`.** `globals.css` gives `:focus-visible` an amber
 * ring on purpose — "keyboard users are not an afterthought on a product
 * families share between devices" — and this class was deleting it from
 * every input, select and textarea in the app, leaving a 1px border
 * colour change as the only focus signal. Colour alone is not a signal.
 */
const controlClass =
  'w-full rounded-tile border border-line bg-paper-sunken px-4 py-3 text-base text-ink placeholder:text-ink-faint transition-colors duration-150 focus:border-amber focus:bg-paper-raised disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClass, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, 'min-h-28 resize-y leading-relaxed', className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(controlClass, 'appearance-none pr-10', className)} {...props}>
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="m6 8 4 4 4-4" />
        </svg>
      </div>
    );
  },
);

export function FieldHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-1.5 text-[0.8rem] leading-relaxed text-ink-faint', className)}>{children}</p>;
}

export function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[0.8rem] font-medium text-rose">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  optional,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  optional?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-[0.72rem] uppercase tracking-wide text-ink-faint">{optional}</span> : null}
      </div>
      {children}
      {hint && !error ? <FieldHint>{hint}</FieldHint> : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}
