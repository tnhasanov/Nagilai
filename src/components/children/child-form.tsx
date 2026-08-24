'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { createChild, updateChild } from '@/features/children/actions';
import { HARD_LIMITS } from '@/config/constants';
import { GENDER_VALUES, type ChildSuggestions, type SuggestionField } from '@/i18n/suggestions';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/i18n';
import type { ChildInput } from '@/features/children/schemas';

const PALETTE = ['#4A3A6B', '#D97E28', '#4F7D5E', '#C4576B', '#3B82F6', '#8B5CF6'];

export interface ChildFormValues extends ChildInput {
  id?: string;
}

/**
 * Child profile form (§3).
 *
 * Filled in once, on a phone, probably at bedtime, by someone who wanted
 * a story two minutes ago. Three things follow from that:
 *
 * **The common answers are one tap.** Every list field offers the
 * ten things children this age actually say, and tapping one writes it
 * into the field. Typing still works and always will — the chips are a
 * shortcut, not a menu, and a child who is into welding gets to be into
 * welding. This is the part that was missing: six empty text boxes asking
 * a tired parent to be imaginative is a form people abandon.
 *
 * **Only the name is required.** The sections say so. A profile with a
 * name and nothing else makes a perfectly good story; everything below
 * makes a better one, and can be added later from the same form.
 *
 * **Gender is a short list, not a text box.** It reaches the prompt as a
 * fact about the child, so it is stored as `girl` / `boy` regardless of
 * which language the parent is using the app in. Blank is a real answer.
 *
 * Photograph upload is deliberately absent from Phase 1. The appearance
 * *description* field gives the illustrator the consistency it needs
 * without ever storing a picture of a child — the feature flag exists for
 * when the consent flow and legal review are signed off (§3, §24).
 */
export function ChildForm({
  initial,
  languages,
  suggestions,
  strings,
}: {
  initial?: ChildFormValues;
  languages: Array<{ code: string; nameNative: string; flag: string | null }>;
  suggestions: ChildSuggestions;
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

  const listFields: Array<{ field: SuggestionField; label: string; value: string[] | undefined }> = [
    { field: 'interests', label: strings.children.interests, value: initial?.interests },
    {
      field: 'favouriteAnimals',
      label: strings.children.favouriteAnimals,
      value: initial?.favouriteAnimals,
    },
    {
      field: 'favouriteActivities',
      label: strings.children.favouriteActivities,
      value: initial?.favouriteActivities,
    },
    {
      field: 'favouriteCharacters',
      label: strings.children.favouriteCharacters,
      value: initial?.favouriteCharacters,
    },
    {
      field: 'personalityTraits',
      label: strings.children.personality,
      value: initial?.personalityTraits,
    },
    {
      field: 'learningInterests',
      label: strings.children.learningInterests,
      value: initial?.learningInterests,
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="card space-y-5">
        <SectionHeader title={strings.children.basics} hint={strings.children.basicsHint} />

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
            <GenderSelect initial={initial?.gender ?? ''} strings={strings.children} />
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
          <legend className="mb-2.5 text-sm font-semibold text-ink">
            {strings.children.colour}
          </legend>
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

      <section className="card space-y-7">
        <SectionHeader
          title={strings.children.loves}
          hint={strings.children.lovesHint}
          optional={strings.common.optional}
        />

        {listFields.map((entry) => (
          <SuggestField
            key={entry.field}
            name={entry.field}
            label={entry.label}
            defaultValue={entry.value}
            suggestions={suggestions[entry.field]}
            hint={strings.children.suggestionsHint}
          />
        ))}
      </section>

      {/* Collapsed by default: genuinely useful, never necessary, and a
          parent adding their first child should reach Save without
          scrolling past two empty textareas. */}
      <details className="card group" open={Boolean(initial?.appearanceDescription || initial?.parentNotes)}>
        <summary className="cursor-pointer list-none">
          <SectionHeader
            title={strings.children.extra}
            hint={strings.children.extraHint}
            optional={strings.common.optional}
            expandable
          />
        </summary>

        <div className="mt-5 space-y-5">
          <Field
            label={strings.children.appearance}
            hint={strings.children.appearanceHint}
            htmlFor="appearanceDescription"
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
          >
            <Textarea
              id="parentNotes"
              name="parentNotes"
              defaultValue={initial?.parentNotes ?? ''}
              maxLength={HARD_LIMITS.maxParentNotesChars}
              rows={3}
            />
          </Field>
        </div>
      </details>

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

function SectionHeader({
  title,
  hint,
  optional,
  expandable,
}: {
  title: string;
  hint: string;
  optional?: string;
  expandable?: boolean;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        {title}
        {optional ? (
          <span className="text-xs font-medium lowercase text-ink-faint">({optional})</span>
        ) : null}
        {expandable ? (
          <span
            aria-hidden="true"
            className="ml-auto text-sm text-ink-faint transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        ) : null}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
    </div>
  );
}

/**
 * A short list with the answer already written down.
 *
 * The text input remains the source of truth — chips read from it and
 * write back into it — so what a parent sees is exactly what will be
 * saved, and pasting a comma-separated list still works. Above the cap
 * the unchosen chips go quiet rather than silently doing nothing, because
 * the server truncates over-long lists without complaint and a control
 * that ignores a tap is worse than one that says it is full.
 */
function SuggestField({
  name,
  label,
  hint,
  suggestions,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  suggestions: string[];
  defaultValue?: string[] | string;
}) {
  const [text, setText] = useState(
    Array.isArray(defaultValue) ? defaultValue.join(', ') : (defaultValue ?? ''),
  );

  const chosen = useMemo(() => parseList(text), [text]);
  const chosenKeys = useMemo(
    () => new Set(chosen.map((value) => value.toLocaleLowerCase())),
    [chosen],
  );
  const full = chosen.length >= HARD_LIMITS.maxInterestsPerField;

  function toggle(value: string) {
    const key = value.toLocaleLowerCase();
    const next = chosenKeys.has(key)
      ? chosen.filter((entry) => entry.toLocaleLowerCase() !== key)
      : [...chosen, value];
    setText(next.join(', '));
  }

  return (
    <Field label={label} hint={hint} htmlFor={name}>
      <ul className="mb-2.5 flex flex-wrap gap-1.5">
        {suggestions.map((value) => {
          const selected = chosenKeys.has(value.toLocaleLowerCase());
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() => toggle(value)}
                aria-pressed={selected}
                disabled={full && !selected}
                className={cn(
                  'rounded-pill border px-3 py-1.5 text-sm transition-all',
                  selected
                    ? 'border-amber bg-amber-soft font-semibold text-amber-deep'
                    : 'border-line bg-paper-raised text-ink-soft hover:border-line-strong',
                  full && !selected ? 'cursor-not-allowed opacity-40' : null,
                )}
              >
                {selected ? '✓ ' : '+ '}
                {value}
              </button>
            </li>
          );
        })}
      </ul>

      <Input id={name} name={name} value={text} onChange={(event) => setText(event.target.value)} />
    </Field>
  );
}

/** Splits the comma-separated field, keeping order and dropping blanks. */
function parseList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Keeps an unrecognised value rather than quietly rewriting the profile.
 *
 * Gender was a free-text box before this, so a saved profile may hold
 * anything at all. A `<select>` that simply did not contain it would
 * silently blank the field the next time the parent edited the child's
 * name — so whatever is there is offered back as its own option.
 */
function GenderSelect({
  initial,
  strings,
}: {
  initial: string;
  strings: Dictionary['children'];
}) {
  const known: string[] = [...GENDER_VALUES];
  const labels: Record<string, string> = {
    girl: strings.genderGirl,
    boy: strings.genderBoy,
  };
  const existing = initial && !known.includes(initial) ? initial : null;

  return (
    <Select id="gender" name="gender" defaultValue={initial}>
      <option value="">{strings.genderUnspecified}</option>
      {known.map((value) => (
        <option key={value} value={value}>
          {labels[value]}
        </option>
      ))}
      {existing ? <option value={existing}>{existing}</option> : null}
    </Select>
  );
}
