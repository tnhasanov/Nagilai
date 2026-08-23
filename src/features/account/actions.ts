'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { supabaseAdmin } from '@/services/supabase/admin';
import { DEFAULT_UI_LOCALE, isUiLocale, LOCALE_COOKIE, UI_LOCALES } from '@/config/constants';

/**
 * Account management (§22).
 *
 * Includes the two things a commercial product handling children's data
 * must be able to do on request: export everything, and delete everything.
 */

const profileSchema = z.object({
  displayName: z.string().trim().max(80).optional().or(z.literal('')),
  uiLocale: z.enum(UI_LOCALES).default(DEFAULT_UI_LOCALE),
  marketingOptIn: z.boolean().default(false),
});

export async function updateProfileAction(input: unknown): Promise<ActionResult<{ updated: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const parsed = profileSchema.parse(input);
    const supabase = await supabaseServer();

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: parsed.displayName || null,
        ui_locale: parsed.uiLocale,
        marketing_opt_in: parsed.marketingOptIn,
      })
      .eq('id', user.id);

    if (error) throw errors.validation('We could not save your settings.');

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, parsed.uiLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });

    revalidatePath('/settings');
    return { updated: true };
  });
}

export async function setLocaleAction(locale: string): Promise<ActionResult<{ locale: string }>> {
  return attempt(async () => {
    const next = isUiLocale(locale) ? locale : DEFAULT_UI_LOCALE;

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, next, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });

    const user = await getCurrentUser();
    if (user) {
      const supabase = await supabaseServer();
      await supabase.from('profiles').update({ ui_locale: next }).eq('id', user.id);
    }

    return { locale: next };
  });
}

/**
 * Data export (§22, §24).
 *
 * Returns everything the account owns as one JSON document. Storage
 * objects are referenced by path rather than inlined -- a parent who wants
 * the images downloads them from the library, and a multi-hundred-megabyte
 * base64 blob would be useless to them anyway.
 */
export async function exportAccountDataAction(): Promise<ActionResult<{ json: string }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    const supabase = await supabaseServer();

    const [profile, children, stories, versions, pages, illustrations, narrations, ledger] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('children').select('*').eq('owner_id', user.id),
        supabase.from('stories').select('*').eq('owner_id', user.id),
        supabase.from('story_versions').select('*'),
        supabase.from('story_pages').select('*'),
        supabase.from('story_illustrations').select('*'),
        supabase.from('narrations').select('*'),
        supabase.from('credit_transactions').select('*').eq('owner_id', user.id),
      ]);

    const document = {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      children: children.data ?? [],
      stories: stories.data ?? [],
      story_versions: versions.data ?? [],
      story_pages: pages.data ?? [],
      story_illustrations: illustrations.data ?? [],
      narrations: narrations.data ?? [],
      credit_transactions: ledger.data ?? [],
    };

    return { json: JSON.stringify(document, null, 2) };
  });
}

/**
 * Account deletion (§22).
 *
 * Two steps by design. The RPC marks the account and revokes every share
 * link immediately, so the user's data stops being reachable the moment
 * they ask. The irreversible erase -- storage objects and the auth record,
 * which cascades through every table -- happens here straight afterwards,
 * because a parent who asks to be forgotten should not have to wait.
 */
export async function deleteAccountAction(confirmation: string): Promise<ActionResult<{ deleted: boolean }>> {
  return attempt(async () => {
    const user = await getCurrentUser();
    if (!user) throw errors.unauthenticated();

    if (confirmation.trim().toLowerCase() !== 'delete') {
      throw errors.validation('Type "delete" to confirm.');
    }

    const supabase = await supabaseServer();
    const { error: rpcError } = await supabase.rpc('request_account_deletion');
    if (rpcError) throw errors.validation('We could not start the deletion. Please contact support.');

    const admin = supabaseAdmin();

    // Remove the private objects first: deleting the auth user cascades
    // the rows that record where those objects live.
    for (const bucket of ['illustrations', 'narrations', 'story-pdfs', 'child-photos'] as const) {
      const { data: objects } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      if (!objects?.length) continue;
      await admin.storage
        .from(bucket)
        .remove(objects.map((object) => `${user.id}/${object.name}`));
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw errors.validation('We could not finish deleting your account. Please contact support.');

    await supabase.auth.signOut();
    return { deleted: true };
  });
}
