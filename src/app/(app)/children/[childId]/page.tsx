import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Shell } from '@/components/site/shell';
import { ChildForm } from '@/components/children/child-form';
import { ArchiveChildButton } from '@/components/children/archive-child-button';
import { getCurrentUser } from '@/services/supabase/server';
import { getChild } from '@/features/children/queries';
import { getCatalogue } from '@/features/stories/catalogue';
import { getDictionary } from '@/i18n';
import { getChildSuggestions } from '@/i18n/suggestions';
import { resolveLocale } from '@/i18n/server';
import { isAppError } from '@/lib/errors';

export const metadata: Metadata = {
  title: 'Edit profile',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function EditChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/children/${childId}`);

  const locale = await resolveLocale();
  const t = getDictionary(locale);

  let child;
  try {
    child = await getChild(user.id, childId);
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  }

  const catalogue = await getCatalogue(locale, child.age_years);

  return (
    <Shell showFooter={false}>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="mb-9 font-display text-3xl font-bold text-ink">{t.children.editChild}</h1>

        <ChildForm
          initial={{
            id: child.id,
            name: child.name,
            nickname: child.nickname ?? '',
            ageYears: child.age_years,
            birthDate: child.birth_date ?? '',
            gender: child.gender ?? '',
            preferredLanguage: child.preferred_language,
            interests: child.interests,
            favouriteAnimals: child.favourite_animals,
            favouriteActivities: child.favourite_activities,
            favouriteCharacters: child.favourite_characters,
            personalityTraits: child.personality_traits,
            learningInterests: child.learning_interests,
            parentNotes: child.parent_notes ?? '',
            avatarColor: child.avatar_color ?? '',
            appearanceDescription: child.appearance_description ?? '',
          }}
          languages={catalogue.languages}
          suggestions={getChildSuggestions(locale)}
          strings={{ children: t.children, common: t.common }}
        />

        <div className="mt-10 border-t border-line pt-6">
          <ArchiveChildButton
            childId={child.id}
            label={t.children.archive}
            confirmation={t.children.archiveConfirm}
          />
        </div>
      </div>
    </Shell>
  );
}
