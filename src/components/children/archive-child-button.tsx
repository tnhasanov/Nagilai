'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { archiveChild } from '@/features/children/actions';

/**
 * Removes a child profile from the parent's list.
 *
 * Archives rather than deletes: stories already made keep their frozen
 * snapshot, and a profile removed by mistake is recoverable by support.
 * A true erase is what the account-deletion flow does (§22).
 */
export function ArchiveChildButton({
  childId,
  label,
  confirmation,
}: {
  childId: string;
  label: string;
  confirmation: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      className="text-ink-faint hover:text-rose"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmation)) return;
        startTransition(async () => {
          const result = await archiveChild(childId);
          if (result.ok) {
            router.push('/children');
            router.refresh();
          } else {
            toast.error(result.error.message);
          }
        });
      }}
    >
      {pending ? <Spinner /> : <Trash2 />}
      {label}
    </Button>
  );
}
