'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { createChild, updateChild } from '@/features/children/actions';
import { HARD_LIMITS } from '@/config/constants';
import type { Dictionary } from '@/i18n';
import type { ChildInput } from '@/features/children/schemas';

const PALETTE = ['#4A3A6B', '#D97E28', '#4F7D5E', '#C4576B', '#3B82F6', '#8B5CF6'];

export interface ChildFormValues extends ChildInput {
  id?: string;
}

/**
 * Child profile form (§3).
 *
 * The interest fields take comma-separated text rather than a tag widget:
 * a parent filling this in on a phone at 8pm should be able to type
 * "dinosaurs, digging, the moon" and move on.
 *
 * Photograph upload is deliberately absent from Phase 1. The appearance
 * *description* field gives the illustrator the consistency it needs
 * without ever storing a picture of a child — the feature flag exists for
 * when the consent flow and legal review are signed off (§3, §24).
 */
export function ChildForm({
  initial,
  languages,
  strings,
}: {
  initial?: ChildFormValues;
  languages: Array<{ code: string; nameNative: string; flag: string | null }>;
  strings: { children: Dictionary['children']; common: Dictionary['common'] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState(initial?.avatarColor || PALETTE[0]!);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const ageValue = String(form.get('ageYears') ?? '').trim();

    const payload = {
      name: String(form.get('name') ?? ''),
      nickname: String(form.get('nickname') ?? ''),
      ageYears: ageValue === '' ? null : Number(ageValue),
      birthDate: '',
      gender: String(form.get('gender') ?? ''),
      preferredLanguage: String(form.get('preferredLanguage') ?? 'en-US'),
      interests: String(form.get('interests') ?? ''),
      favouriteAnimals: String(form.get('favouriteAnimals') ?? ''),
      favouriteActivities: String(form.get('favouriteActivities') ?? ''),
      favouriteCharacters: String(form.get('favouriteCharacters') ?? ''),
      personalityTraits: String(form.get('personalityTraits') ?? ''),
      learningInterests: String(form.get('learningInterests') ?? ''),
      parentNotes: String(form.get('parentNotes') ?? ''),
      avatarColor,
      appearanceDescription: String(form.get('appearanceDescription') ?? ''),
    } as unknown as ChildInput;

    startTransition(async () => {
      const result = initial?.id ? await updateChild(initial.id, payload) : await createChild(payload);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      toast.success(strings.children.saved);
      router.push('/children');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="card space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={strings.children.name} hint={strings.children.nameHint} htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={initial?.name ?? ''}
              maxLength={HARD_LIMITS.maxChildNameChars}
              required
              autoFocus
            />
          </Field>

          <Field
            label={strings.children.nickname}
            hint={strings.children.nicknameHint}
            htmlFor="nickname"
            optional={strings.common.optional}
          >
            <Input
              id="nickname"
              name="nickname"
              defaultValue={initial?.nickname ?? ''}
              maxLength={HARD_LIMITS.maxChildNameChars}
            />
          </Field>

          <Field label={strings.children.age} htmlFor="ageYears">
            <Input
              id="ageYears"
              name="ageYears"
              type="number"
              inputMode="numeric"
              min={0}
              max={17}
              defaultValue={initial?.ageYears ?? ''}
            />
          </Field>

          <Field label={strings.children.gender} htmlFor="gender" optional={strings.common.optional}>
            <Input id="gender" name="gender" defaultValue={initial?.gender ?? ''} maxLength={40} />
          </Field>
        </div>

        <Field label={strings.children.language} htmlFor="preferredLanguage">
          <Select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={initial?.preferredLanguage ?? languages[0]?.code ?? 'en-US'}
          >
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.flag ? `${language.flag}  ` : ''}
                {language.nameNative}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2.5 text-sm font-semibold text-ink">Colour</legend>
          <div className="flex gap-2">
            {PALETTE.map((colour) => (
              <button
                key={colour}
                type="button"
                onClick={() => setAvatarColor(colour)}
                aria-label={colour}
                aria-pressed={avatarColor === colour}
                className="size-9 rounded-pill border-2 transition-transform hover:scale-110"
                style={{
                  background: colour,
                  borderColor: avatarColor === colour ? 'var(--color-ink)' : 'transparent',
                }}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TagField
            name="interests"
            label={strings.children.interests}
            hint={strings.children.tagsHint}
            defaultValue={initial?.interests}
          />
          <TagField
            name="favouriteAnimals"
            label={strings.children.favouriteAnimals}
            hint={strings.children.tagsHint}
            defaultValue={initial?.favouriteAnimals}
          />
          <TagField
            name="favouriteActivities"
            label={strings.children.favouriteActivities}
            hint={strings.children.tagsHint}
            defaultValue={initial?.favouriteActivities}
          />
          <TagField
            name="favouriteCharacters"
            label={strings.children.favouriteCharacters}
            hint={strings.children.tagsHint}
            defaultValue={initial?.favouriteCharacters}
          />
          <TagField
            name="personalityTraits"
            label={strings.children.personality}
            hint={strings.children.tagsHint}
            defaultValue={initial?.personalityTraits}
          />
          <TagField
            name="learningInterests"
            label={strings.children.learningInterests}
            hint={strings.children.tagsHint}
            defaultValue={initial?.learningInterests}
          />
        </div>
      </section>

      <section className="card space-y-5">
        <Field
          label={strings.children.appearance}
          hint={strings.children.appearanceHint}
          htmlFor="appearanceDescription"
          optional={strings.common.optional}
        >
          <Textarea
            id="appearanceDescription"
            name="appearanceDescription"
            defaultValue={initial?.appearanceDescription ?? ''}
            maxLength={600}
            rows={3}
          />
        </Field>

        <Field
          label={strings.children.parentNotes}
          hint={strings.children.parentNotesHint}
          htmlFor="parentNotes"
          optional={strings.common.optional}
        >
          <Textarea
            id="parentNotes"
            name="parentNotes"
            defaultValue={initial?.parentNotes ?? ''}
            maxLength={HARD_LIMITS.maxParentNotesChars}
            rows={3}
          />
        </Field>
      </section>

      {error ? (
        <p role="alert" className="rounded-tile bg-rose-soft px-4 py-3 text-sm font-medium text-rose">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {strings.common.cancel}
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? strings.common.saving : strings.common.save}
        </Button>
      </div>
    </form>
  );
}

/** A comma-separated list field. Values arrive as `string[]` from the DB. */
function TagField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue?: string[] | string;
}) {
  const initial = Array.isArray(defaultValue) ? defaultValue.join(', ') : (defaultValue ?? '');
  return (
    <Field label={label} hint={hint} htmlFor={name}>
      <Input id={name} name={name} defaultValue={initial} />
    </Field>
  );
}
