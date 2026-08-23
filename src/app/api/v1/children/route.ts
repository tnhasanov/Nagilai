import { authenticated, body, preflight } from '@/services/api/handler';
import { errors } from '@/lib/errors';
import { listChildren, countChildren } from '@/features/children/queries';
import { childInputSchema } from '@/features/children/schemas';
import { getSetting } from '@/services/config/settings';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS, HARD_LIMITS } from '@/config/constants';
import { serialiseChild } from '@/features/children/serialise';

/**
 * Child profiles (§3).
 *
 * The most privacy-sensitive endpoint in the API. Every query runs
 * through the caller's own token, so Row Level Security — not this file —
 * is what guarantees one family cannot read another's children.
 */
export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export const GET = authenticated(async ({ actor }) => {
  const children = await listChildren(actor.userId, actor.db);
  return { children: children.map(serialiseChild) };
});

export const POST = authenticated(async ({ actor, request }) => {
  const input = await body(request, childInputSchema);

  const planLimits = await getSetting('plan_limits');
  const existing = await countChildren(actor.userId, actor.db);
  const allowed = Math.min(planLimits.free.max_children, HARD_LIMITS.maxChildrenPerAccount);

  if (existing >= allowed) {
    throw errors.validation(`Your plan includes ${allowed} child profiles. Upgrade to add more.`);
  }

  const { data, error } = await actor.db
    .from('children')
    .insert({
      owner_id: actor.userId,
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
    .select('*')
    .single();

  if (error || !data) throw errors.validation('We could not save this profile. Please try again.');

  await capture({
    name: ANALYTICS_EVENTS.childCreated,
    ownerId: actor.userId,
    properties: { language: input.preferredLanguage, has_age: input.ageYears !== null },
  });

  return { child: serialiseChild(data) };
});

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
