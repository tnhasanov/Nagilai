import { authenticated, body, preflight } from '@/services/api/handler';
import { errors } from '@/lib/errors';
import { getChild } from '@/features/children/queries';
import { childInputSchema } from '@/features/children/schemas';
import { serialiseChild } from '@/features/children/serialise';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated<{ childId: string }, unknown>(async ({ actor, params }) => {
  const child = await getChild(actor.userId, params.childId, actor.db);
  return { child: serialiseChild(child) };
});

export const PATCH = authenticated<{ childId: string }, unknown>(async ({ actor, request, params }) => {
  const input = await body(request, childInputSchema);

  const { data, error } = await actor.db
    .from('children')
    .update({
      name: input.name,
      nickname: emptyToNull(input.nickname),
      age_years: input.ageYears ?? null,
      birth_date: emptyToNull(input.birthDate),
      gender: emptyToNull(input.gender),
      preferred_language: input.preferredLanguage,
      interests: input.interests,
      favourite_animals: input.favouriteAnimals,
      favourite_activities: input.favouriteActivities,
      favourite_characters: input.favouriteCharacters,
      personality_traits: input.personalityTraits,
      learning_interests: input.learningInterests,
      parent_notes: emptyToNull(input.parentNotes),
      avatar_color: emptyToNull(input.avatarColor),
      appearance_description: emptyToNull(input.appearanceDescription),
    })
    .eq('id', params.childId)
    .eq('owner_id', actor.userId)
    .select('*')
    .maybeSingle();

  if (error || !data) throw errors.notFound('Child');
  return { child: serialiseChild(data) };
});

/**
 * Archives rather than deletes.
 *
 * Stories keep a frozen snapshot of the child, so removing the row would
 * not orphan a book — but a parent who removes a profile by mistake would
 * lose the details behind every future story. A real erase is what the
 * account-deletion flow does (§22).
 */
export const DELETE = authenticated<{ childId: string }, unknown>(async ({ actor, params }) => {
  const { data, error } = await actor.db
    .from('children')
    .update({ is_archived: true })
    .eq('id', params.childId)
    .eq('owner_id', actor.userId)
    .select('id')
    .maybeSingle();

  if (error || !data) throw errors.notFound('Child');
  return { archived: true };
});

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
