import 'server-only';

import { supabaseAdmin } from '@/services/supabase/admin';
import { localise } from '@/types/domain';
import type { Json } from '@/types/database';

/**
 * The wizard's option lists (§4).
 *
 * Read from the configuration tables rather than hard-coded, so an
 * administrator can add a theme, a language, a voice or an art style
 * without a deployment (§18). Labels are localised into the parent's
 * interface language, which is separate from the story language (§13).
 */

export interface CatalogueOption {
  slug: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  accentColor?: string | null;
  isPremium?: boolean;
  /** True for the "my own idea" theme, which asks for the idea. */
  isCustomInput?: boolean;
  category?: string;
  /**
   * The age band this option is written for.
   *
   * Carried to the client so the wizard can re-filter when a parent
   * switches child. Filtering only on the server means filtering for
   * whichever child happened to be first.
   */
  minAge?: number;
  maxAge?: number;
}

export interface LanguageOption {
  code: string;
  nameNative: string;
  nameEn: string;
  flag: string | null;
}

export interface Catalogue {
  languages: LanguageOption[];
  themes: CatalogueOption[];
  objectives: CatalogueOption[];
  styles: CatalogueOption[];
  voices: CatalogueOption[];
}

export async function getCatalogue(uiLocale: string, childAge: number | null = null): Promise<Catalogue> {
  const admin = supabaseAdmin();

  const [languages, themes, objectives, styles, voices] = await Promise.all([
    admin
      .from('languages')
      .select('code, name_native, name_en, flag_emoji')
      .eq('is_active', true)
      .eq('is_story_language', true)
      .order('sort_order'),
    admin
      .from('themes')
      .select('slug, labels, descriptions, icon, accent_color, is_premium, is_custom_input, min_age, max_age')
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('educational_objectives')
      .select('slug, labels, category, min_age, max_age')
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('illustration_styles')
      .select('slug, labels, is_premium, preview_image_url')
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('voices')
      .select('slug, labels, description, is_premium')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  const withinAge = (min: number, max: number) => childAge === null || (childAge >= min && childAge <= max);

  return {
    languages: (languages.data ?? []).map((row) => ({
      code: row.code,
      nameNative: row.name_native,
      nameEn: row.name_en,
      flag: row.flag_emoji,
    })),
    themes: (themes.data ?? [])
      .filter((row) => withinAge(row.min_age, row.max_age))
      .map((row) => ({
        slug: row.slug,
        label: localise(row.labels as Json, uiLocale),
        description: localise(row.descriptions as Json, uiLocale) || null,
        icon: row.icon,
        accentColor: row.accent_color,
        isPremium: row.is_premium,
        isCustomInput: row.is_custom_input,
        minAge: row.min_age,
        maxAge: row.max_age,
      })),
    objectives: (objectives.data ?? [])
      .filter((row) => withinAge(row.min_age, row.max_age))
      .map((row) => ({
        slug: row.slug,
        label: localise(row.labels as Json, uiLocale),
        category: row.category,
        minAge: row.min_age,
        maxAge: row.max_age,
      })),
    styles: (styles.data ?? []).map((row) => ({
      slug: row.slug,
      label: localise(row.labels as Json, uiLocale),
      isPremium: row.is_premium,
    })),
    voices: (voices.data ?? []).map((row) => ({
      slug: row.slug,
      label: localise(row.labels as Json, uiLocale),
      description: row.description,
      isPremium: row.is_premium,
    })),
  };
}

/** Themes for the marketing pages, where there is no signed-in locale. */
export async function getPublicThemes(uiLocale: string, limit = 8): Promise<CatalogueOption[]> {
  const { data } = await supabaseAdmin()
    .from('themes')
    .select('slug, labels, icon, accent_color')
    .eq('is_active', true)
    .eq('is_custom_input', false)
    .order('sort_order')
    .limit(limit);

  return (data ?? []).map((row) => ({
    slug: row.slug,
    label: localise(row.labels as Json, uiLocale),
    icon: row.icon,
    accentColor: row.accent_color,
  }));
}
