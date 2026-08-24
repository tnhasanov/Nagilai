import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { StoryWizard } from '@/components/create/story-wizard';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { listChildren } from '@/features/children/queries';
import { getCatalogue } from '@/features/stories/catalogue';
import { getSetting } from '@/services/config/settings';
import { getDictionary } from '@/i18n';
import { resolveLocale } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Create a story',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/create');

  const locale = await resolveLocale();
  const t = getDictionary(locale);
  const supabase = await supabaseServer();

  const [children, credits, limits, features, profile] = await Promise.all([
    listChildren(user.id),
    getSetting('credits'),
    getSetting('generation_limits'),
    getSetting('features'),
    supabase.from('profiles').select('credit_balance').eq('id', user.id).maybeSingle(),
  ]);

  // Unfiltered on purpose. This used to pass `children[0].age_years`, so
  // the themes and learning goals a parent could choose from were the
  // ones suitable for their *first* child and stayed that way when they
  // picked a different one — a six-year-old's list offered to a
  // ten-year-old. The wizard filters by the selected child in the
  // browser, where it knows who is selected.
  const catalogue = await getCatalogue(locale);

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-9 font-display text-3xl font-bold text-ink sm:text-4xl">{t.create.title}</h1>

        <StoryWizard
          childProfiles={children.map((child) => ({
            id: child.id,
            name: child.name,
            nickname: child.nickname,
            ageYears: child.age_years,
            preferredLanguage: child.preferred_language,
            avatarColor: child.avatar_color,
            interests: child.interests,
          }))}
          catalogue={catalogue}
          strings={{ create: t.create, common: t.common, children: t.children }}
          /* The ingredients of the price rather than the price, because
             the wizard's own controls change it. `createStory` runs the
             same estimator against the same settings before it accepts
             anything, so the number shown is the number enforced. */
          costing={{
            textCost: credits.story_text,
            illustrationCost: credits.story_illustration,
            illustrationsEnabled: features.illustrations_enabled,
            pagesByLength: {
              short: limits.short.pages,
              medium: limits.medium.pages,
              long: limits.long.pages,
            },
          }}
          creditBalance={profile.data?.credit_balance ?? 0}
          locale={locale}
        />
      </div>
    </Shell>
  );
}
