import Link from 'next/link';
import { Brand } from '@/components/site/brand';
import { LocaleSwitcher } from '@/components/site/locale-switcher';
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

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-rise">{children}</div>
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
