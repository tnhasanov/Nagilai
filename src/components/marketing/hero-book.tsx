import { cn } from '@/lib/utils';

/**
 * The hero illustration: an open storybook.
 *
 * Hand-drawn as inline SVG rather than shipped as an image, for three
 * reasons. It stays crisp at any size, it costs no network request on the
 * first paint of the landing page (§30), and it can react to the theme —
 * the night sky genuinely darkens in dark mode instead of sitting in a
 * bright rectangle.
 *
 * The scene deliberately shows the *product*, not the technology (§20):
 * a child, a book, a sky full of stars.
 */
export function HeroBook({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 460"
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label="An open storybook showing a child looking up at a starry sky"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B2E63" />
          <stop offset="55%" stopColor="#6B4E7D" />
          <stop offset="100%" stopColor="#C97F63" />
        </linearGradient>
        <linearGradient id="pageLeft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="88%" stopColor="#FBF4E8" />
          <stop offset="100%" stopColor="#EFE3D0" />
        </linearGradient>
        <linearGradient id="pageRight" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="88%" stopColor="#FBF4E8" />
          <stop offset="100%" stopColor="#EFE3D0" />
        </linearGradient>
        <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3E6B52" />
          <stop offset="100%" stopColor="#2C5240" />
        </linearGradient>
        <filter id="bookShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#4A3220" floodOpacity="0.28" />
        </filter>
        <linearGradient id="spineFold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F3E9D9" />
          <stop offset="28%" stopColor="#DCCDB2" />
          <stop offset="50%" stopColor="#B49A78" />
          <stop offset="72%" stopColor="#DCCDB2" />
          <stop offset="100%" stopColor="#F3E9D9" />
        </linearGradient>
        <clipPath id="leftPageClip">
          <path d="M56 96c74-26 148-26 214 10v268c-66-36-140-36-214-10V96Z" />
        </clipPath>
      </defs>

      {/* The book, tilted very slightly so it sits on a table rather than
          floating flat against the viewport. */}
      <g filter="url(#bookShadow)" transform="rotate(-1.5 320 240)">
        {/* Board edges peeking out beneath the pages. */}
        <path d="M44 88c78-28 156-28 226 12v276c-70-40-148-40-226-12V88Z" fill="#B4562C" />
        <path d="M596 88c-78-28-156-28-226 12v276c70-40 148-40 226-12V88Z" fill="#9E4823" />

        <path d="M56 96c74-26 148-26 214 10v268c-66-36-140-36-214-10V96Z" fill="url(#pageLeft)" />
        <path d="M584 96c-74-26-148-26-214 10v268c66-36 140-36 214-10V96Z" fill="url(#pageRight)" />

        {/* Left page: the illustration. */}
        <g clipPath="url(#leftPageClip)">
          <path d="M76 118c62-20 124-20 178 8v170H76V118Z" fill="url(#sky)" />

          {/* Stars, twinkling on staggered delays so the sky feels alive
              without anything moving fast enough to distract. */}
          <g fill="#FFF6DC">
            <circle cx="108" cy="150" r="2.4" className="animate-twinkle" style={{ animationDelay: '0s' }} />
            <circle cx="152" cy="132" r="1.7" className="animate-twinkle" style={{ animationDelay: '1.1s' }} />
            <circle cx="196" cy="158" r="2.1" className="animate-twinkle" style={{ animationDelay: '2.3s' }} />
            <circle cx="232" cy="136" r="1.5" className="animate-twinkle" style={{ animationDelay: '0.7s' }} />
            <circle cx="128" cy="188" r="1.4" className="animate-twinkle" style={{ animationDelay: '1.9s' }} />
            <circle cx="214" cy="196" r="1.9" className="animate-twinkle" style={{ animationDelay: '3.1s' }} />
            <circle cx="172" cy="172" r="1.2" className="animate-twinkle" style={{ animationDelay: '2.6s' }} />
          </g>

          {/* Moonglow, so the sky has a light source the hill can answer. */}
          <circle cx="222" cy="134" r="34" fill="#FFE9B8" opacity="0.13" />
          <circle cx="222" cy="134" r="20" fill="#FFE9B8" opacity="0.16" />

          {/* A crescent moon, made by subtracting one disc from another. */}
          <path
            d="M236 122a22 22 0 1 0 0 40 26 26 0 0 1 0-40Z"
            fill="#FFE9B8"
            transform="translate(-14 6)"
          />

          <path d="M76 236c40-22 84-24 122-6 32 15 58 12 80-4v62H76v-52Z" fill="url(#hill)" />

          {/* The child: back to us, one arm raised towards the moon.
              Faceless on purpose — every child who reads this should be
              able to be them. */}
          <g transform="translate(146 202)">
            <ellipse cx="2" cy="76" rx="24" ry="5" fill="#16301F" opacity="0.5" />

            {/* legs */}
            <path d="M-8 74V56h7v18h-7Z" fill="#33507A" />
            <path d="M4 74V56h7v18H4Z" fill="#33507A" />
            <path d="M-11 74h11v4h-11a2 2 0 0 1 0-4Z" fill="#26313F" />
            <path d="M4 74h11a2 2 0 0 1 0 4H4v-4Z" fill="#26313F" />

            {/* coat */}
            <path d="M-14 58V38c0-8 6-14 15-14s15 6 15 14v20a68 68 0 0 1-30 0Z" fill="#E8A33D" />
            <path d="M0 24c5 0 9 2 12 5l-12 8-12-8c3-3 7-5 12-5Z" fill="#F2BC66" />

            {/* the raised arm, reaching for the moon */}
            <path
              d="M13 42c8-4 14-12 16-22"
              stroke="#E8A33D"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="30" cy="19" r="4" fill="#C68642" />

            {/* the resting arm */}
            <path d="M-13 42c-4 5-6 11-6 17" stroke="#E8A33D" strokeWidth="7" strokeLinecap="round" fill="none" />
            <circle cx="-19" cy="60" r="4" fill="#C68642" />

            {/* head, tipped back to look up */}
            <circle cx="1" cy="14" r="13" fill="#C68642" />
            <path
              d="M-12 12c0-9 6-15 13-15s13 6 13 15c0 0-3-6-13-6s-13 6-13 6Z"
              fill="#3A2A20"
            />
            <path d="M12 10c3 1 5 4 4 7-1 3-4 4-6 2" fill="#3A2A20" />
          </g>
        </g>

        {/* Right page: ruled text lines standing in for the story. The
            first line is longer, as an opening line usually is. */}
        <g stroke="#C9B79D" strokeWidth="4.5" strokeLinecap="round" opacity="0.75">
          <path d="M398 150h158" />
          <path d="M398 176h172" />
          <path d="M398 202h146" />
          <path d="M398 228h166" />
          <path d="M398 254h124" />
          <path d="M398 296h168" />
          <path d="M398 322h140" />
          <path d="M398 348h158" />
        </g>
        <path d="M398 118h84" stroke="#D97E28" strokeWidth="7" strokeLinecap="round" />

        {/* The fold: one shape darkening into the gutter, so it reads
            as paper creasing rather than a pale band down the middle. */}
        <path
          d="M270 106c16 6 34 6 50 0 16-6 34-6 50 0v268c-16 6-34 6-50 0-16-6-34-6-50 0V106Z"
          fill="url(#spineFold)"
        />
      </g>

      {/* Loose sparkles drifting above the book. */}
      <g fill="#D97E28" opacity="0.85">
        <path
          d="M540 62c1.6 8 3.6 10 11.6 11.6-8 1.6-10 3.6-11.6 11.6-1.6-8-3.6-10-11.6-11.6 8-1.6 10-3.6 11.6-11.6Z"
          className="animate-drift"
        />
        <path
          d="M92 48c1.1 5.6 2.5 7 8.1 8.1-5.6 1.1-7 2.5-8.1 8.1-1.1-5.6-2.5-7-8.1-8.1 5.6-1.1 7-2.5 8.1-8.1Z"
          className="animate-drift"
          style={{ animationDelay: '3s' }}
        />
        <path
          d="M626 250c.9 4.4 2 5.5 6.4 6.4-4.4.9-5.5 2-6.4 6.4-.9-4.4-2-5.5-6.4-6.4 4.4-.9 5.5-2 6.4-6.4Z"
          className="animate-drift"
          style={{ animationDelay: '6s' }}
        />
      </g>
    </svg>
  );
}
