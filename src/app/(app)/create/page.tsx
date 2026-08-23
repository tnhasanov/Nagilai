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

  const [children, credits, profile] = await Promise.all([
    listChildren(user.id),
    getSetting('credits'),
    supabase.from('profiles').select('credit_balance').eq('id', user.id).maybeSingle(),
  ]);

  // Themes and learning goals are filtered by the selected child's age, so
  // the catalogue is built for whoever the wizard will open on.
  const catalogue = await getCatalogue(locale, children[0]?.age_years ?? null);

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
          creditCost={credits.story_text}
          creditBalance={profile.data?.credit_balance ?? 0}
        />
      </div>
    </Shell>
  );
}
