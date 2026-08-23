'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { errors } from '@/lib/errors';
import { attempt, type ActionResult } from '@/lib/result';
import { supabaseAdmin } from '@/services/supabase/admin';
import { invalidateSettingsCache, type SettingKey } from '@/services/config/settings';
import { requeue } from '@/services/jobs/queue';
import { kickWorker } from '@/services/jobs/worker';
import { requireAdmin, requireStaff } from './queries';
import type { Json } from '@/types/database';

/**
 * Admin mutations (§18, §24).
 *
 * Everything an administrator changes here is business configuration -- a
 * price, a model id, a feature flag, a theme -- and every change is
 * written to `admin_audit_log` with a before/after snapshot.
 */

const SETTING_KEYS = [
  'credits',
  'ai_models',
  'ai_pricing',
  'generation_limits',
  'rate_limits',
  'features',
  'plan_limits',
  'safety',
  'branding',
] as const satisfies readonly SettingKey[];

const settingSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.string().min(2, 'Provide a JSON object.'),
});

export async function updateSettingAction(input: unknown): Promise<ActionResult<{ key: string }>> {
  return attempt(async () => {
    const context = await requireAdmin();
    const parsed = settingSchema.parse(input);

    let value: unknown;
    try {
      value = JSON.parse(parsed.value);
    } catch {
      throw errors.validation('That is not valid JSON.');
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw errors.validation('A setting must be a JSON object.');
    }

    const admin = supabaseAdmin();
    const { data: before } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', parsed.key)
      .maybeSingle();

    const { error } = await admin
      .from('app_settings')
      .update({ value: value as Json, updated_by: context.userId })
      .eq('key', parsed.key);

    if (error) throw errors.validation('We could not save that setting.');

    invalidateSettingsCache(parsed.key);

    await audit({
      actorId: context.userId,
      action: 'settings.update',
      entityType: 'app_settings',
      entityId: parsed.key,
      before: before?.value ?? null,
      after: value as Json,
    });

    revalidatePath('/admin/settings');
    return { key: parsed.key };
  });
}

const themeToggleSchema = z.object({ slug: z.string().min(1), isActive: z.boolean() });

export async function toggleThemeAction(input: unknown): Promise<ActionResult<{ slug: string }>> {
  return attempt(async () => {
    const context = await requireAdmin();
    const parsed = themeToggleSchema.parse(input);

    const { error } = await supabaseAdmin()
      .from('themes')
      .update({ is_active: parsed.isActive })
      .eq('slug', parsed.slug);

    if (error) throw errors.validation('We could not update that theme.');

    await audit({
      actorId: context.userId,
      action: 'theme.toggle',
      entityType: 'themes',
      entityId: parsed.slug,
      before: null,
      after: { is_active: parsed.isActive },
    });

    revalidatePath('/admin/content');
    revalidatePath('/create');
    return { slug: parsed.slug };
  });
}

export async function requeueJobAction(jobId: string): Promise<ActionResult<{ jobId: string }>> {
  return attempt(async () => {
    const context = await requireStaff();
    await requeue(jobId);
    kickWorker();

    await audit({
      actorId: context.userId,
      action: 'job.requeue',
      entityType: 'generation_jobs',
      entityId: jobId,
      before: null,
      after: null,
    });

    revalidatePath('/admin/jobs');
    return { jobId };
  });
}

/**
 * Records an administrative action (§24).
 *
 * Best-effort: an audit write must not roll back the change it describes,
 * but a failure is logged loudly enough to notice.
 */
async function audit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Json | null;
  after: Json | null;
}): Promise<void> {
  const headerList = await headers();

  const { error } = await supabaseAdmin()
    .from('admin_audit_log')
    .insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      before_state: input.before,
      after_state: input.after,
      ip_address: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: headerList.get('user-agent')?.slice(0, 300) ?? null,
    });

  if (error) console.error('[admin] audit write failed', error.message);
}
