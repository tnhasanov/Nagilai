'use server';

import { revalidatePath } from 'next/cache';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { getSetting } from '@/services/config/settings';
import { capture } from '@/services/analytics';
import { ANALYTICS_EVENTS, HARD_LIMITS } from '@/config/constants';
import { childInputSchema, type ChildInput } from './schemas';
import { countChildren } from './queries';

/**
 * Child profile mutations (§3).
 *
 * Server actions, so no API surface exists for these at all -- there is no
 * endpoint to enumerate children. Writes go through the user-scoped
 * client, which means RLS still applies even though `owner_id` is set from
 * the session rather than from the request body.
 */

export async function createChild(input: ChildInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const parsed = childInputSchema.parse(input);

    // Plan entitlement. Free accounts get two children (§16); the limit is
    // configuration, not a constant in this file.
    const planLimits = await getSetting('plan_limits');
    const existing = await countChildren(user.id);
    const allowed = Math.min(planLimits.free.max_children, HARD_LIMITS.maxChildrenPerAccount);

    if (existing >= allowed) {
      // `details` is what the form localises from; the sentence is for
      // the API and the logs.
      throw errors.validation(`Your plan includes ${allowed} child profiles. Upgrade to add more.`, {
        reason: 'child_limit',
        allowed,
      });
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('children')
      .insert({
        owner_id: user.id,
        name: parsed.name,
        nickname: emptyToNull(parsed.nickname),
        age_years: parsed.ageYears ?? null,
        birth_date: emptyToNull(parsed.birthDate),
        gender: emptyToNull(parsed.gender),
        preferred_language: parsed.preferredLanguage,
        interests: parsed.interests,
        favourite_animals: parsed.favouriteAnimals,
        favourite_activities: parsed.favouriteActivities,
        favourite_characters: parsed.favouriteCharacters,
        personality_traits: parsed.personalityTraits,
        learning_interests: parsed.learningInterests,
        parent_notes: emptyToNull(parsed.parentNotes),
        avatar_color: emptyToNull(parsed.avatarColor),
        appearance_description: emptyToNull(parsed.appearanceDescription),
      })
      .select('id')
      .single();

    if (error || !data) throw errors.validation('We could not save this profile. Please try again.');

    await capture({
      name: ANALYTICS_EVENTS.childCreated,
      ownerId: user.id,
      properties: { language: parsed.preferredLanguage, has_age: parsed.ageYears !== null },
    });

    revalidatePath('/children');
    revalidatePath('/create');
    return { id: data.id };
  });
}

export async function updateChild(childId: string, input: ChildInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const parsed = childInputSchema.parse(input);
    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from('children')
      .update({
        name: parsed.name,
        nickname: emptyToNull(parsed.nickname),
        age_years: parsed.ageYears ?? null,
        birth_date: emptyToNull(parsed.birthDate),
        gender: emptyToNull(parsed.gender),
        preferred_language: parsed.preferredLanguage,
        interests: parsed.interests,
        favourite_animals: parsed.favouriteAnimals,
        favourite_activities: parsed.favouriteActivities,
        favourite_characters: parsed.favouriteCharacters,
        personality_traits: parsed.personalityTraits,
        learning_interests: parsed.learningInterests,
        parent_notes: emptyToNull(parsed.parentNotes),
        avatar_color: emptyToNull(parsed.avatarColor),
        appearance_description: emptyToNull(parsed.appearanceDescription),
      })
      .eq('id', childId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle();

    if (error || !data) throw errors.notFound('Child');

    revalidatePath('/children');
    revalidatePath(`/children/${childId}`);
    return { id: data.id };
  });
}

/**
 * Archives rather than deletes.
 *
 * Stories keep a frozen `child_snapshot`, so removing the profile row
 * outright would not orphan a book -- but a parent who removes a profile
 * by mistake would lose the details behind every future story. Archiving
 * hides it and keeps the recovery path; the account-deletion flow (§22)
 * is what performs a genuine erase.
 */
export async function archiveChild(childId: string): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('children')
      .update({ is_archived: true })
      .eq('id', childId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle();

    if (error || !data) throw errors.notFound('Child');

    revalidatePath('/children');
    return { id: data.id };
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
