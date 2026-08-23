'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { updateSettingAction } from '@/features/admin/actions';

/**
 * A single `app_settings` row, edited as JSON.
 *
 * JSON rather than a bespoke form per setting: these are business knobs
 * an operator changes occasionally, and a hand-built form for each would
 * be a lot of surface to maintain for little gain. The value is validated
 * client-side as parseable and again server-side against the setting's
 * schema, so a malformed edit is rejected rather than silently breaking
 * generation.
 */
export function SettingEditor({
  settingKey,
  description,
  value,
  saveLabel,
}: {
  settingKey: string;
  description: string | null;
  value: string;
  saveLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();

  const dirty = draft !== value;
  const valid = isParseable(draft);

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-bold text-ink">{settingKey}</h2>
        {!valid ? <span className="text-xs font-semibold text-rose">Invalid JSON</span> : null}
      </div>

      {description ? <p className="mb-3 text-xs leading-relaxed text-ink-soft">{description}</p> : null}

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={Math.min(20, draft.split('\n').length + 1)}
        spellCheck={false}
        className="font-mono text-xs"
        aria-label={settingKey}
      />

      <div className="mt-3 flex justify-end gap-2">
        {dirty ? (
          <Button variant="ghost" size="sm" onClick={() => setDraft(value)}>
            Reset
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={!dirty || !valid || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateSettingAction({ key: settingKey, value: draft });
              if (result.ok) toast.success(`${settingKey} saved`);
              else toast.error(result.error.message);
            })
          }
        >
          {pending ? <Spinner /> : null}
          {saveLabel}
        </Button>
      </div>
    </section>
  );
}

function isParseable(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
