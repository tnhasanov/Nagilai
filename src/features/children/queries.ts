import 'server-only';

import { errors } from '@/lib/errors';
import { supabaseServer } from '@/services/supabase/server';
import type { Child } from '@/types/domain';

/**
 * Child profile reads.
 *
 * Every query here runs through the *user-scoped* Supabase client, so Row
 * Level Security is the thing enforcing ownership. The `.eq('owner_id')`
 * filters are a second, explicit layer -- belt and braces on the most
 * sensitive table in the product.
 */

export async function listChildren(ownerId: string): Promise<Child[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw errors.notFound('Children');
  return data;
}

export async function getChild(ownerId: string, childId: string): Promise<Child> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('id', childId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error || !data) throw errors.notFound('Child');
  return data;
}

export async function countChildren(ownerId: string): Promise<number> {
  const supabase = await supabaseServer();
  const { count, error } = await supabase
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('is_archived', false);

  if (error) return 0;
  return count ?? 0;
}
