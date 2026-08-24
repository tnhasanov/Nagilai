'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, Link2, Pencil, Shuffle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  deleteStoryAction,
  remixStoryAction,
  renameStoryAction,
  requestPdfAction,
} from '@/features/stories/actions';
import { createOrUpdateShareLink, revokeShareLink, type ShareState } from '@/features/sharing/actions';
import { format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import type { RemixKind } from '@/types/database';

const REMIX_KINDS: RemixKind[] = [
  'alternate_ending',
  'new_adventure',
  'shorter',
  'longer',
  'different_lesson',
  'different_language',
  'different_style',
];

/**
 * The owner's toolbar for a finished story (§11, §12, §14, §21).
 *
 * Sharing, downloading and remixing all open a small dialog rather than
 * navigating away, so a parent never loses their place in the book.
 */
export function StoryActions({
  storyId,
  title,
  shareState,
  languages,
  strings,
}: {
  storyId: string;
  title: string;
  shareState: ShareState | null;
  languages: Array<{ code: string; nameNative: string }>;
  strings: {
    library: Dictionary['library'];
    share: Dictionary['share'];
    remix: Dictionary['remix'];
    common: Dictionary['common'];
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ShareDialog storyId={storyId} initial={shareState} strings={strings} />
      <DownloadButton storyId={storyId} strings={strings} />
      <RemixDialog storyId={storyId} languages={languages} strings={strings} />
      <RenameDialog storyId={storyId} title={title} strings={strings} />
      <DeleteButton storyId={storyId} strings={strings} />
    </div>
  );
}

type Strings = Parameters<typeof StoryActions>[0]['strings'];

/* ------------------------------------------------------------------ */

function ShareDialog({
  storyId,
  initial,
  strings,
}: {
  storyId: string;
  initial: ShareState | null;
  strings: Strings;
}) {
  const [state, setState] = useState<ShareState | null>(initial);
  const [allowAudio, setAllowAudio] = useState(initial?.allowAudio ?? true);
  const [allowDownload, setAllowDownload] = useState(initial?.allowDownload ?? false);
  const [allowIndexing, setAllowIndexing] = useState(initial?.allowIndexing ?? false);
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await createOrUpdateShareLink({
        storyId,
        allowAudio,
        allowDownload,
        allowIndexing,
        expiresInDays,
      });
      if (result.ok) {
        setState(result.data);
        toast.success(strings.share.title);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function copyLink() {
    if (!state?.url) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    toast.success(strings.common.copied);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Link2 />
          {strings.library.share}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.share.title}</DialogTitle>
          <DialogDescription>{strings.share.body}</DialogDescription>
        </DialogHeader>

        {state?.url ? (
          <div className="mb-2 flex gap-2">
            <Input readOnly value={state.url} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
            <Button variant="secondary" size="icon" onClick={copyLink} aria-label={strings.common.copy}>
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : null}

        <div className="divide-y divide-line">
          <SwitchRow label={strings.share.allowAudio} checked={allowAudio} onCheckedChange={setAllowAudio} />
          <SwitchRow
            label={strings.share.allowDownload}
            checked={allowDownload}
            onCheckedChange={setAllowDownload}
          />
          <SwitchRow
            label={strings.share.allowIndexing}
            description={strings.share.allowIndexingHint}
            checked={allowIndexing}
            onCheckedChange={setAllowIndexing}
          />
        </div>

        <Field label={strings.share.expiry} htmlFor="expiry" className="mt-4">
          <Select
            id="expiry"
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          >
            <option value={0}>{strings.share.expiryNever}</option>
            {[7, 30, 90].map((days) => (
              <option key={days} value={days}>
                {format(strings.share.expiryDays, { count: days })}
              </option>
            ))}
          </Select>
        </Field>

        {state ? (
          <p className="mt-4 text-xs text-ink-faint">{format(strings.share.views, { count: state.viewCount })}</p>
        ) : null}

        <DialogFooter>
          {state ? (
            <Button
              variant="danger"
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeShareLink(storyId);
                  if (result.ok) {
                    setState(null);
                    toast.success(strings.share.revoked);
                  }
                })
              }
              disabled={pending}
            >
              {strings.share.revoke}
            </Button>
          ) : null}
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : null}
            {state ? strings.common.save : strings.share.createLink}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function DownloadButton({ storyId, strings }: { storyId: string; strings: Strings }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await requestPdfAction({ storyId, variant: 'digital', pageSize: 'a5' });
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          // The signed URL carries a `download` disposition, so opening it
          // saves the file rather than navigating away from the book.
          window.location.href = result.data.url;
        })
      }
    >
      {pending ? <Spinner /> : <Download />}
      {strings.library.download}
    </Button>
  );
}

/* ------------------------------------------------------------------ */

function RemixDialog({
  storyId,
  languages,
  strings,
}: {
  storyId: string;
  languages: Array<{ code: string; nameNative: string }>;
  strings: Strings;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RemixKind>('alternate_ending');
  const [languageCode, setLanguageCode] = useState(languages[0]?.code ?? 'en-US');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Shuffle />
          {strings.library.remix}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.remix.title}</DialogTitle>
          <DialogDescription>{strings.remix.body}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {REMIX_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`rounded-tile border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                kind === value
                  ? 'border-amber bg-amber-soft text-amber-deep'
                  : 'border-line bg-paper-sunken text-ink-soft hover:border-line-strong'
              }`}
            >
              {strings.remix[value]}
            </button>
          ))}
        </div>

        {kind === 'different_language' ? (
          <Field label={strings.remix.different_language} htmlFor="remix-language" className="mt-4">
            <Select
              id="remix-language"
              value={languageCode}
              onChange={(event) => setLanguageCode(event.target.value)}
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nameNative}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await remixStoryAction({
                  storyId,
                  kind,
                  languageCode: kind === 'different_language' ? languageCode : null,
                });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                router.push(`/library/${result.data.storyId}?progress=1`);
              })
            }
          >
            {pending ? <Spinner /> : null}
            {strings.remix.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function RenameDialog({ storyId, title, strings }: { storyId: string; title: string; strings: Strings }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil />
          {strings.library.rename}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{strings.library.rename}</DialogTitle>
        </DialogHeader>

        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={120} autoFocus />

        <DialogFooter>
          <Button
            disabled={pending || value.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await renameStoryAction(storyId, value);
                if (result.ok) {
                  toast.success(result.data.title);
                  router.refresh();
                } else {
                  toast.error(result.error.message);
                }
              })
            }
          >
            {pending ? <Spinner /> : null}
            {strings.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function DeleteButton({ storyId, strings }: { storyId: string; strings: Strings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ink-faint hover:text-rose">
          <Trash2 />
          {strings.common.delete}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{strings.common.delete}</DialogTitle>
          <DialogDescription>{strings.library.deleteConfirm}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {/* The only action here used to be Delete. A confirmation whose
              sole button is the destructive one is not a confirmation —
              closing it meant finding the × or pressing Escape. */}
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {strings.common.cancel}
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteStoryAction(storyId);
                if (result.ok) {
                  router.push('/library');
                  router.refresh();
                } else {
                  toast.error(result.error.message);
                }
              })
            }
          >
            {pending ? <Spinner /> : null}
            {strings.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
