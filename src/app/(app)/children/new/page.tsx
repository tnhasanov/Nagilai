import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { ChildForm } from '@/components/children/child-form';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { countChildren } from '@/features/children/queries';
import { getSetting } from '@/services/config/settings';
import { HARD_LIMITS } from '@/config/constants';
import { format } from '@/i18n';
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

  /*
   * The same check `createChild` enforces, made before the form instead
   * of after it. A parent at their plan's limit used to fill in the whole
   * profile and learn at Save that none of it could be kept.
   */
  const [planLimits, existing] = await Promise.all([getSetting('plan_limits'), countChildren(user.id)]);
  const allowed = Math.min(planLimits.free.max_children, HARD_LIMITS.maxChildrenPerAccount);
  if (existing >= allowed) {
    return (
      <Shell showFooter={false}>
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <EmptyState
            icon={<Users />}
            title={t.children.limitReachedTitle}
            description={format(t.children.limitReachedBody, { count: allowed })}
            action={
              <Button asChild variant="secondary">
                <Link href="/children">{t.children.title}</Link>
              </Button>
            }
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-2 font-display text-3xl font-bold text-ink sm:text-4xl">{t.children.addChild}</h1>
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
