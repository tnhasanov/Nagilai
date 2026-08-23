import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The Nagilai wordmark.
 *
 * An open book drawn as two facing pages, with a single amber spark above
 * it. Set in the display face so the brand and the story text share a
 * voice.
 */
export function Brand({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-2.5', className)} aria-label="Nagilai home">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <path
          d="M4 8.5c3.6-1.8 7.4-1.8 11 .6v16c-3.6-2.4-7.4-2.4-11-.6v-16Z"
          className="fill-ink transition-transform duration-300 group-hover:-translate-x-px"
        />
        <path
          d="M28 8.5c-3.6-1.8-7.4-1.8-11 .6v16c3.6-2.4 7.4-2.4 11-.6v-16Z"
          className="fill-ink-soft transition-transform duration-300 group-hover:translate-x-px"
        />
        <path
          d="M16 4.2c.5 2.4 1.1 3 3.5 3.5-2.4.5-3 1.1-3.5 3.5-.5-2.4-1.1-3-3.5-3.5 2.4-.5 3-1.1 3.5-3.5Z"
          className="fill-amber"
        />
      </svg>
      <span className="font-display text-[1.35rem] font-bold tracking-tight text-ink">Nagilai</span>
    </Link>
  );
}
