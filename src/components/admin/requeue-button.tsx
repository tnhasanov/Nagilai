'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { requeueJobAction } from '@/features/admin/actions';

export function RequeueButton({ jobId, label }: { jobId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await requeueJobAction(jobId);
          if (result.ok) {
            toast.success(label);
            router.refresh();
          } else {
            toast.error(result.error.message);
          }
        })
      }
    >
      {pending ? <Spinner /> : <RefreshCw />}
      {label}
    </Button>
  );
}
