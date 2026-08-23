import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/supabase/server';
import { getStoryProgress } from '@/features/stories/queries';
import { toAppError } from '@/lib/errors';

/**
 * Generation progress poll (§27).
 *
 * Deliberately tiny: the waiting room hits this every few seconds, so it
 * does one indexed read and returns a handful of numbers. Ownership is
 * enforced through the user-scoped client inside `getStoryProgress`.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  }

  try {
    const progress = await getStoryProgress(user.id, storyId);
    return NextResponse.json(progress, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
