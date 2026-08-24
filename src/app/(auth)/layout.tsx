import Link from 'next/link';
import { Brand } from '@/components/site/brand';
import { LocaleSwitcher } from '@/components/site/locale-switcher';
import { HeroBook } from '@/components/marketing/hero-book';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

/**
 * Auth layout.
 *
 * Deliberately quieter than the app shell: one card on warm paper, no
 * navigation to wander off into. The only way out is forward or home.
 *
 * The one control that does belong here is the language switcher. Before
 * anyone signs in there is no saved preference, so the locale is a guess
 * from `Accept-Language` — and a wrong guess left a parent stuck on the
 * first screen of the product reading a language they had not chosen,
 * with no way to change it until after they had signed in. The two legal
 * links are translated for the same reason.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  return (
    <div className="aurora flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <Brand />
        <LocaleSwitcher current={locale} label={t.common.interfaceLanguage} />
      </header>

      {/* The illustrated storybook, beside the card on a laptop and in
          miniature above it on a phone. Signing up is the front door of
          the product, and it used to be the one page with no story in it. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-2 px-4 py-8 sm:px-6 lg:flex-row lg:gap-20">
        {/* One instance, resized by CSS, never two. Rendering a second
            copy for mobile duplicates the SVG's gradient and filter ids,
            and a `url(#…)` reference resolves to the *first* match in
            the document — the one inside the hidden desktop block, which
            paints nothing. The book disappeared on phones, leaving three
            sparkles floating in space. */}
        <div className="w-56 animate-rise sm:w-64 lg:w-auto lg:max-w-xl lg:flex-1">
          <HeroBook />
          <p className="mt-8 hidden text-center font-display text-3xl font-bold leading-snug text-ink text-balance lg:block">
            {t.landing.tagline}
          </p>
        </div>

        <div className="w-full max-w-md animate-rise lg:shrink-0" style={{ animationDelay: '90ms' }}>
          {children}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-ink-faint sm:px-6">
        <Link href="/privacy" className="hover:text-ink-soft">
          {t.common.privacy}
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-ink-soft">
          {t.common.terms}
        </Link>
      </footer>
    </div>
  );
}
