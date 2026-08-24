'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { createChild, updateChild } from '@/features/children/actions';
import { HARD_LIMITS } from '@/config/constants';
import { GENDER_VALUES, type ChildSuggestions, type SuggestionField } from '@/i18n/suggestions';
import type { UiLocale } from '@/config/constants';
import { cn } from '@/lib/utils';
import { defaultStoryLanguage, format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import type { ChildInput } from '@/features/children/schemas';

/*
 * Literal hex, because the value is persisted and `childInputSchema`
 * validates it as `#rrggbb` — but every one of these is a real token
 * from globals.css. Two of them used to be Tailwind's default blue and
 * violet, which are the only cold colours anywhere in a product built
 * entirely out of warm paper.
 *
 * Named, so the swatch can announce something better than "#4A3A6B".
 */
const PALETTE = [
  { value: '#4A3A6B', key: 'colourPlum' },
  { value: '#D97E28', key: 'colourAmber' },
  { value: '#4F7D5E', key: 'colourSage' },
  { value: '#C4576B', key: 'colourRose' },
  { value: '#B0611A', key: 'colourClay' },
  { value: '#2B2119', key: 'colourInk' },
] as const;

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
  locale,
  strings,
}: {
  initial?: ChildFormValues;
  languages: Array<{ code: string; nameNative: string; flag: string | null }>;
  suggestions: ChildSuggestions;
  /** Seeds the story language for a new child. */
  locale: UiLocale;
  strings: { children: Dictionary['children']; common: Dictionary['common'] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState(initial?.avatarColor || PALETTE[0].value);

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
        setError(messageFor(result.error, strings));
        return;
      }

      toast.success(strings.children.saved);

      /*
       * Back where they came from.
       *
       * Two of the four routes into this form are mid-story-creation —
       * the wizard's "add a child first" empty state, and its "+ Add a
       * child" tile — and both used to land a parent on the profile list
       * with nothing telling them the story they came for was still two
       * navigations away. `?next=` is the same convention the sign-in
       * form already uses; the guard keeps it an in-app path.
       */
      const next = searchParams.get('next');
      router.push(next?.startsWith('/') && !next.startsWith('//') ? next : '/children');
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

          <Field label={strings.children.age} htmlFor="ageYears" optional={strings.common.optional}>
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
            defaultValue={initial?.preferredLanguage ?? defaultStoryLanguage(languages, locale)}
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
          {/* `flex-wrap` because six 44px swatches and their gaps do not
              fit inside a padded card at 375px. */}
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((colour) => (
              <button
                key={colour.value}
                type="button"
                onClick={() => setAvatarColor(colour.value)}
                aria-label={strings.children[colour.key]}
                aria-pressed={avatarColor === colour.value}
                className="size-11 rounded-pill border-2 transition-transform hover:scale-110 active:scale-95"
                style={{
                  background: colour.value,
                  borderColor: avatarColor === colour.value ? 'var(--color-ink)' : 'transparent',
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
            strings={strings.children}
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

      {/*
        Pinned to the bottom of the phone screen.

        The form says only the name is required and then puts Save below
        six sections of things that are not, so on a phone the parent had
        to scroll past all of it to act on what they had just been told.
        Sticky on small screens, ordinary on a laptop where the whole form
        is visible anyway.
      */}
      <div className="pb-safe sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-line bg-paper/90 px-4 py-3.5 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
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

/**
 * A failed save, in the parent's language.
 *
 * The server's `message` is parent-safe English — right for the API and
 * the logs, wrong for a Turkish page. The two codes this form can
 * actually produce are re-rendered from `code`/`details`; anything
 * unexpected keeps the server's wording rather than gaining a worse one.
 */
function messageFor(
  error: { code: string; message: string; details?: Record<string, unknown> },
  strings: { children: Dictionary['children']; common: Dictionary['common'] },
): string {
  if (error.details?.['reason'] === 'child_limit') {
    const allowed = error.details['allowed'];
    return format(strings.children.limitReachedBody, {
      count: typeof allowed === 'number' ? allowed : 0,
    });
  }
  if (error.code === 'validation_failed') return strings.common.checkDetails;
  return error.message;
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
 * A short list with the answers already written down.
 *
 * Every value is a chip. The ten suggestions are chips you switch on, and
 * anything typed becomes a chip too — so the field shows its contents at
 * a glance and a value is removed by tapping the thing itself rather than
 * by editing a comma out of a sentence.
 *
 * The first version of this kept a permanent text box under each chip
 * row. Six of them stacked down the form as six large empty sunken
 * rectangles that read as unfilled required fields, which is precisely
 * the impression this screen must not give: everything here is optional.
 * The box now appears only when a parent asks for it.
 *
 * Above the cap the unchosen chips go quiet rather than silently doing
 * nothing, because the server truncates over-long lists without
 * complaint and a control that ignores a tap is worse than one that says
 * it is full.
 */
function SuggestField({
  name,
  label,
  suggestions,
  defaultValue,
  strings,
}: {
  name: string;
  label: string;
  suggestions: string[];
  defaultValue?: string[] | string;
  strings: Dictionary['children'];
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    Array.isArray(defaultValue) ? defaultValue : parseList(defaultValue ?? ''),
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const chosenKeys = useMemo(
    () => new Set(chosen.map((value) => value.toLocaleLowerCase())),
    [chosen],
  );
  const full = chosen.length >= HARD_LIMITS.maxInterestsPerField;

  /* Anything chosen that is not one of the ten. Shown after the
     suggestions so a parent's own words are never buried among ours. */
  const suggestionKeys = useMemo(
    () => new Set(suggestions.map((value) => value.toLocaleLowerCase())),
    [suggestions],
  );
  const custom = chosen.filter((value) => !suggestionKeys.has(value.toLocaleLowerCase()));

  function toggle(value: string) {
    const key = value.toLocaleLowerCase();
    setChosen((current) =>
      chosenKeys.has(key)
        ? current.filter((entry) => entry.toLocaleLowerCase() !== key)
        : [...current, value],
    );
  }

  /* Commas still split, so a pasted list behaves the way it looks. */
  function commitDraft() {
    const additions = parseList(draft).filter(
      (value) => !chosenKeys.has(value.toLocaleLowerCase()),
    );
    if (additions.length > 0) {
      setChosen((current) => [...current, ...additions].slice(0, HARD_LIMITS.maxInterestsPerField));
    }
    setDraft('');
    setAdding(false);
  }

  return (
    <Field label={label} htmlFor={adding ? `${name}-draft` : undefined}>
      {/* The value the form actually submits. `tagInput` accepts either a
          list or this comma-separated string. */}
      <input type="hidden" name={name} value={chosen.join(', ')} />

      <ul className="flex flex-wrap gap-1.5">
        {suggestions.map((value) => (
          <li key={value}>
            <Chip
              label={value}
              selected={chosenKeys.has(value.toLocaleLowerCase())}
              disabled={full && !chosenKeys.has(value.toLocaleLowerCase())}
              onClick={() => toggle(value)}
            />
          </li>
        ))}

        {custom.map((value) => (
          <li key={value}>
            <Chip label={value} selected removable removeLabel={strings.remove} onClick={() => toggle(value)} />
          </li>
        ))}

        {adding ? (
          <li className="flex items-center gap-1.5">
            <input
              id={`${name}-draft`}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraft();
                } else if (event.key === 'Escape') {
                  setDraft('');
                  setAdding(false);
                }
              }}
              placeholder={strings.addYourOwnPlaceholder}
              maxLength={60}
              className="h-11 w-52 rounded-pill border border-amber bg-paper-sunken px-3.5 text-base text-ink placeholder:text-ink-faint"
            />
          </li>
        ) : (
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={full}
              className={cn(
                'inline-flex min-h-11 items-center rounded-pill border border-dashed border-line-strong px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors',
                full ? 'cursor-not-allowed opacity-40' : 'hover:border-amber hover:text-amber-deep',
              )}
            >
              + {strings.addYourOwn}
            </button>
          </li>
        )}
      </ul>
    </Field>
  );
}

function Chip({
  label,
  selected,
  disabled,
  removable,
  removeLabel,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  removable?: boolean;
  removeLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={removable && removeLabel ? `${removeLabel}: ${label}` : undefined}
      disabled={disabled}
      className={cn(
        /* `min-h-11` is the 44px phone tap target, matching `size: md` in
           button.tsx. An earlier version of this comment claimed py-1.5
           got there on its own; it does not — that is 38px. `py-2` still
           matters for a long label that wraps at 375px. */
        'inline-flex min-h-11 items-center rounded-pill border px-3.5 py-2 text-sm transition-all active:scale-95',
        selected
          ? 'animate-pop border-amber bg-amber-soft font-semibold text-amber-deep'
          : 'border-line bg-paper-sunken text-ink-soft hover:border-line-strong hover:text-ink',
        disabled ? 'cursor-not-allowed opacity-40' : null,
      )}
    >
      <span aria-hidden="true" className="mr-1 opacity-70">
        {removable ? '\u00d7' : selected ? '\u2713' : '+'}
      </span>
      {label}
    </button>
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
