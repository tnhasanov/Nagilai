import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { ChildForm } from '@/components/children/child-form';
import { getCurrentUser } from '@/services/supabase/server';
import { getCatalogue } from '@/features/stories/catalogue';
import { getDictionary } from '@/i18n';
import { getChildSuggestions } from '@/i18n/suggestions';
import { resolveLocale } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Add a child',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NewChildPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/children/new');

  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const catalogue = await getCatalogue(locale);

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-2 font-display text-3xl font-bold text-ink">{t.children.addChild}</h1>
        <p className="mb-9 text-sm text-ink-soft">{t.children.subtitle}</p>

        <ChildForm
          languages={catalogue.languages}
          suggestions={getChildSuggestions(locale)}
          locale={locale}
          strings={{ children: t.children, common: t.common }}
        />
      </div>
    </Shell>
  );
}
