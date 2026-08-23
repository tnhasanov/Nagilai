import type { Child } from '@/types/domain';

/**
 * The wire shape of a child profile.
 *
 * Hand-written rather than returning the database row, for two reasons.
 * It is camelCase, so a native client is not littered with snake_case;
 * and more importantly it is an *allow list* — a column added to
 * `children` later cannot leak to a client by accident.
 *
 * `photo_storage_path` and `photo_consent_by` are deliberately absent:
 * nothing outside the server has any use for them.
 */
export interface ChildPayload {
  id: string;
  name: string;
  nickname: string | null;
  ageYears: number | null;
  gender: string | null;
  preferredLanguage: string;
  interests: string[];
  favouriteAnimals: string[];
  favouriteActivities: string[];
  favouriteCharacters: string[];
  personalityTraits: string[];
  learningInterests: string[];
  parentNotes: string | null;
  appearanceDescription: string | null;
  avatarColor: string | null;
  createdAt: string;
}

export function serialiseChild(child: Child): ChildPayload {
  return {
    id: child.id,
    name: child.name,
    nickname: child.nickname,
    ageYears: child.age_years,
    gender: child.gender,
    preferredLanguage: child.preferred_language,
    interests: child.interests,
    favouriteAnimals: child.favourite_animals,
    favouriteActivities: child.favourite_activities,
    favouriteCharacters: child.favourite_characters,
    personalityTraits: child.personality_traits,
    learningInterests: child.learning_interests,
    parentNotes: child.parent_notes,
    appearanceDescription: child.appearance_description,
    avatarColor: child.avatar_color,
    createdAt: child.created_at,
  };
}
