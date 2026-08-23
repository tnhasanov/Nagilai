import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Brand } from '@/components/site/brand';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

/**
 * 404.
 *
 * Reached by a wrong link, a deleted story, or a revoked share token —
 * so it never blames the visitor and never leaks whether the thing ever
 * existed (§21).
 */
export default async function NotFound() {
  const locale = await resolveLocale();
  const t = getDictionary(locale);

  return (
    <div className="aurora flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Brand className="mb-10" />
      <p className="font-display text-7xl font-bold text-line-strong" aria-hidden="true">
        404
      </p>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">{t.errors.notFound}</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-soft">{t.errors.notFoundBody}</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/">{t.errors.goHome}</Link>
      </Button>
    </div>
  );
}
