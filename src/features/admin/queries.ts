import 'server-only';

import { errors } from '@/lib/errors';
import { getCurrentUser, supabaseServer } from '@/services/supabase/server';
import { supabaseAdmin } from '@/services/supabase/admin';
import type { Json } from '@/types/database';

/**
 * Admin reads (§18).
 *
 * `requireStaff()` is the gate. It is enforced again inside
 * `admin_dashboard_metrics()` in the database, so a mistake in a route
 * guard does not become a data leak.
 *
 * What an admin can see is deliberately bounded: aggregate counts, cost
 * totals, failed jobs and moderation flags -- never an individual child's
 * profile or the text of somebody's story.
 */

export interface StaffContext {
  userId: string;
  role: 'admin' | 'support';
}

export async function requireStaff(): Promise<StaffContext> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();

  const supabase = await supabaseServer();
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

  if (!data || (data.role !== 'admin' && data.role !== 'support')) {
    throw errors.forbidden('Staff access required');
  }
  return { userId: user.id, role: data.role };
}

export async function requireAdmin(): Promise<StaffContext> {
  const context = await requireStaff();
  if (context.role !== 'admin') throw errors.forbidden('Admin access required');
  return context;
}

export interface DashboardMetrics {
  windowDays: number;
  users: { total: number; new: number; active: number };
  children: { total: number };
  stories: {
    total: number;
    recent: number;
    failed: number;
    byLanguage: Record<string, number>;
    byTheme: Record<string, number>;
  };
  assets: { images: number; narrations: number; pdfs: number };
  aiCost: { totalMicroUsd: number; byOperation: Record<string, number> };
  jobs: { queued: number; running: number; failed: number };
  moderation: { flagged: number };
  commerce: {
    revenueMinor: number;
    activeSubscriptions: number;
    creditPurchases: number;
    orders: number;
  };
}

export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  await requireStaff();

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('admin_dashboard_metrics', { p_days: days });

  if (error || !data) throw errors.forbidden('Could not load metrics');

  const payload = data as Record<string, Json>;
  const node = (key: string) => (payload[key] ?? {}) as Record<string, Json>;

  return {
    windowDays: num(payload['window_days']) ?? days,
    users: {
      total: num(node('users')['total']) ?? 0,
      new: num(node('users')['new']) ?? 0,
      active: num(node('users')['active']) ?? 0,
    },
    children: { total: num(node('children')['total']) ?? 0 },
    stories: {
      total: num(node('stories')['total']) ?? 0,
      recent: num(node('stories')['recent']) ?? 0,
      failed: num(node('stories')['failed']) ?? 0,
      byLanguage: numberMap(node('stories')['by_language']),
      byTheme: numberMap(node('stories')['by_theme']),
    },
    assets: {
      images: num(node('assets')['images']) ?? 0,
      narrations: num(node('assets')['narrations']) ?? 0,
      pdfs: num(node('assets')['pdfs']) ?? 0,
    },
    aiCost: {
      totalMicroUsd: num(node('ai_cost')['total_micro_usd']) ?? 0,
      byOperation: numberMap(node('ai_cost')['by_operation']),
    },
    jobs: {
      queued: num(node('jobs')['queued']) ?? 0,
      running: num(node('jobs')['running']) ?? 0,
      failed: num(node('jobs')['failed']) ?? 0,
    },
    moderation: { flagged: num(node('moderation')['flagged']) ?? 0 },
    commerce: {
      revenueMinor: num(node('commerce')['revenue_minor']) ?? 0,
      activeSubscriptions: num(node('commerce')['active_subscriptions']) ?? 0,
      creditPurchases: num(node('commerce')['credit_purchases']) ?? 0,
      orders: num(node('commerce')['orders']) ?? 0,
    },
  };
}

export interface FailedJobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  storyId: string | null;
  createdAt: string;
}

export async function listFailedJobs(limit = 25): Promise<FailedJobRow[]> {
  await requireStaff();

  const { data } = await supabaseAdmin()
    .from('generation_jobs')
    .select('id, type, status, attempts, error_message, story_id, created_at')
    .in('status', ['failed', 'dead_letter'])
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.error_message,
    storyId: row.story_id,
    createdAt: row.created_at,
  }));
}

export interface ModerationRow {
  id: number;
  stage: string;
  outcome: string;
  categories: string[];
  excerpt: string | null;
  createdAt: string;
}

export async function listModerationEvents(limit = 25): Promise<ModerationRow[]> {
  await requireStaff();

  const { data } = await supabaseAdmin()
    .from('moderation_events')
    .select('id, stage, outcome, categories, excerpt, created_at')
    .neq('outcome', 'allowed')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    stage: row.stage,
    outcome: row.outcome,
    categories: row.categories,
    excerpt: row.excerpt,
    createdAt: row.created_at,
  }));
}

export interface CostRow {
  operation: string;
  model: string;
  calls: number;
  costMicroUsd: number;
}

export async function listCostBreakdown(days = 30): Promise<CostRow[]> {
  await requireStaff();

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabaseAdmin()
    .from('usage_events')
    .select('operation, model, estimated_cost_micro_usd')
    .gte('created_at', since)
    .limit(10_000);

  const grouped = new Map<string, CostRow>();
  for (const row of data ?? []) {
    const key = `${row.operation}:${row.model}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.calls += 1;
      existing.costMicroUsd += row.estimated_cost_micro_usd;
    } else {
      grouped.set(key, {
        operation: row.operation,
        model: row.model,
        calls: 1,
        costMicroUsd: row.estimated_cost_micro_usd,
      });
    }
  }

  return [...grouped.values()].sort((a, b) => b.costMicroUsd - a.costMicroUsd);
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'number') out[key] = entry;
  }
  return out;
}
