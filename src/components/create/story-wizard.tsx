'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Sparkles, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Select, Textarea, Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { createStoryAction } from '@/features/stories/actions';
import { HARD_LIMITS } from '@/config/constants';
import { cn } from '@/lib/utils';
import { defaultStoryLanguage, format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import { estimateStoryCost } from '@/services/credits/estimate';
import type { Catalogue, CatalogueOption } from '@/features/stories/catalogue';
import type { StoryLength } from '@/types/database';
import type { UiLocale } from '@/config/constants';

export interface WizardChild {
  id: string;
  name: string;
  nickname: string | null;
  ageYears: number | null;
  preferredLanguage: string;
  avatarColor: string | null;
  interests: string[];
}

/**
 * Everything needed to price a book in the browser.
 *
 * Passed in whole rather than as a single pre-computed number, because
 * the cost changes with two of the wizard's own controls — length and
 * whether there are pictures — and a number worked out on the server is
 * already stale by the time the parent picks "Long".
 */
export interface WizardCosting {
  textCost: number;
  illustrationCost: number;
  /** The global switch. A parent cannot buy pictures that are turned off. */
  illustrationsEnabled: boolean;
  pagesByLength: Record<StoryLength, number>;
}

/**
 * The story creation wizard (§4).
 *
 * Three steps, because the generation experience "must feel magical and
 * simple": who it is for, what kind of story, and a couple of optional
 * touches. Nothing technical is exposed — no model, no token budget, no
 * image size. Those are resolved on the server from configuration.
 *
 * The child's saved preferences pre-fill the language, so the common case
 * is three taps and a button (§3: do not make parents re-enter the same
 * information).
 */
export function StoryWizard({
  childProfiles,
  catalogue,
  strings,
  costing,
  creditBalance,
  locale,
}: {
  /* Named `childProfiles` rather than `children`: React treats a prop
     called `children` specially, and this is data, not JSX. */
  childProfiles: WizardChild[];
  catalogue: Catalogue;
  strings: {
    create: Dictionary['create'];
    common: Dictionary['common'];
    children: Dictionary['children'];
  };
  costing: WizardCosting;
  creditBalance: number;
  /** Falls back to the parent's own language, not catalogue order. */
  locale: UiLocale;
}) {
  const router = useRouter();
  /*
   * Skip "who is it for?" when there is only one answer.
   *
   * The step is not removed — Back still reaches it, and a parent with a
   * second child still starts there — but pressing Next past a single
   * card that is already selected is a tap that asks nothing.
   */
  const [step, setStep] = useState(childProfiles.length === 1 ? 1 : 0);
  const [pending, startTransition] = useTransition();

  const [childId, setChildId] = useState(childProfiles[0]?.id ?? '');
  const selectedChild = useMemo(
    () => childProfiles.find((child) => child.id === childId),
    [childProfiles, childId],
  );

  const [languageCode, setLanguageCode] = useState(
    childProfiles[0]?.preferredLanguage ?? defaultStoryLanguage(catalogue.languages, locale),
  );
  /*
   * Age-filtered here rather than on the server, because the server does
   * not know which child is selected — it used to filter for
   * `children[0]` and leave that list in place however many times the
   * parent switched child.
   */
  const themes = useMemo(
    () => catalogue.themes.filter((option) => suitableFor(option, selectedChild?.ageYears ?? null)),
    [catalogue.themes, selectedChild],
  );
  const objectives = useMemo(
    () =>
      catalogue.objectives.filter((option) => suitableFor(option, selectedChild?.ageYears ?? null)),
    [catalogue.objectives, selectedChild],
  );

  const [themeSlug, setThemeSlug] = useState(
    catalogue.themes.find((option) => suitableFor(option, childProfiles[0]?.ageYears ?? null))?.slug ??
      catalogue.themes[0]?.slug ??
      'adventure',
  );
  const [objectiveSlug, setObjectiveSlug] = useState('');
  /* Empty when illustrations are switched off globally, so the wizard
     cannot price or promise a picture the server will not make. */
  const [styleSlug, setStyleSlug] = useState(
    costing.illustrationsEnabled ? (catalogue.styles[0]?.slug ?? 'storybook') : '',
  );
  const [length, setLength] = useState<StoryLength>('medium');
  const [customInstructions, setCustomInstructions] = useState('');
  const [dedication, setDedication] = useState('');

  if (childProfiles.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus />}
        title={strings.create.addChildFirst}
        description={strings.create.addChildFirstBody}
        action={
          <Button asChild size="lg">
            <Link href="/children/new">
              <UserPlus />
              {strings.children.addChild}
            </Link>
          </Button>
        }
      />
    );
  }

  const steps = [strings.create.stepChild, strings.create.stepStory, strings.create.stepDetails];

  /*
   * The same function the server runs before it accepts the story, out of
   * the same module.
   *
   * This used to be a `creditCost` number handed down from the page, and
   * it was the cost of the story's *first job*. So the wizard told a
   * parent holding three credits that a ten-page illustrated book "uses 1
   * credit", enabled the button, and the server refused it — one image
   * per page plus a cover is twelve. Two places doing the same arithmetic
   * is what caused that. There is now one.
   */
  const illustrated = costing.illustrationsEnabled && styleSlug !== '';
  const pages = costing.pagesByLength[length];
  const estimate = estimateStoryCost({
    pages,
    illustrated,
    textCost: costing.textCost,
    illustrationCost: costing.illustrationCost,
  });
  const textOnly = estimateStoryCost({
    pages,
    illustrated: false,
    textCost: costing.textCost,
    illustrationCost: costing.illustrationCost,
  });
  const canAfford = creditBalance >= estimate.total;
  /* Only worth offering when it genuinely unblocks them. */
  const offerTextOnly = illustrated && !canAfford && creditBalance >= textOnly.total;

  function submit() {
    startTransition(async () => {
      const result = await createStoryAction({
        childId,
        languageCode,
        themeSlug,
        objectiveSlug: objectiveSlug || null,
        illustrationStyleSlug: styleSlug || null,
        length,
        customInstructions,
        dedication,
      });

      if (!result.ok) {
        toast.error(messageFor(result.error, strings));
        return;
      }
      router.push(`/library/${result.data.storyId}?progress=1`);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
      <div>
        {/* ---- Stepper ------------------------------------------- */}
        <ol className="mb-9 flex items-center gap-2">
          {steps.map((label, position) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => position < step && setStep(position)}
                disabled={position > step}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-pill text-sm font-bold transition-colors',
                  position < step
                    ? 'bg-sage text-white'
                    : position === step
                      ? 'bg-ink text-paper'
                      : 'bg-paper-sunken text-ink-faint',
                )}
                aria-current={position === step ? 'step' : undefined}
              >
                {position < step ? <Check className="size-4" /> : position + 1}
              </button>
              <span
                className={cn(
                  'text-sm font-semibold',
                  /* On a phone only the step you are on is named; three
                     labels do not fit and three bare circles say nothing. */
                  position === step ? 'text-ink' : 'hidden text-ink-faint sm:block',
                )}
              >
                {label}
              </span>
              {position < steps.length - 1 ? <span className="h-px flex-1 bg-line" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>

        {/* ---- Step 1: the child ---------------------------------- */}
        {step === 0 ? (
          <section className="animate-rise space-y-6">
            <h2 className="font-display text-2xl font-bold text-ink">{strings.create.stepChild}</h2>

            <ul className="grid gap-3 sm:grid-cols-2">
              {childProfiles.map((child) => {
                const selected = child.id === childId;
                return (
                  <li key={child.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChildId(child.id);
                        setLanguageCode(child.preferredLanguage);

                        /* A theme or lesson chosen for one child may not
                           be offered for another, and a selection that is
                           no longer in the list is a silent one. */
                        const allowed = catalogue.themes.filter((option) =>
                          suitableFor(option, child.ageYears),
                        );
                        if (!allowed.some((option) => option.slug === themeSlug)) {
                          setThemeSlug(allowed[0]?.slug ?? '');
                        }
                        if (
                          objectiveSlug &&
                          !catalogue.objectives.some(
                            (option) =>
                              option.slug === objectiveSlug && suitableFor(option, child.ageYears),
                          )
                        ) {
                          setObjectiveSlug('');
                        }
                      }}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-card border p-4 text-left transition-all',
                        selected
                          ? 'border-amber bg-amber-soft shadow-page'
                          : 'border-line bg-paper-raised hover:border-line-strong',
                      )}
                    >
                      <span
                        className="flex size-12 shrink-0 items-center justify-center rounded-pill font-display text-lg font-bold text-white"
                        style={{ background: child.avatarColor ?? 'var(--color-plum)' }}
                        aria-hidden="true"
                      >
                        {(child.nickname ?? child.name).charAt(0).toLocaleUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-ink">{child.nickname ?? child.name}</span>
                        {child.ageYears !== null ? (
                          <span className="block text-xs text-ink-soft">
                            {format(strings.children.yearsOld, { age: child.ageYears })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}

              <li>
                <Link
                  href="/children/new"
                  className="flex h-full min-h-20 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-sm font-semibold text-ink-faint transition-colors hover:border-amber hover:text-amber-deep"
                >
                  <UserPlus className="size-4" />
                  {strings.children.addChild}
                </Link>
              </li>
            </ul>
          </section>
        ) : null}

        {/* ---- Step 2: the story ---------------------------------- */}
        {step === 1 ? (
          <section className="animate-rise space-y-8">
            <h2 className="font-display text-2xl font-bold text-ink">{strings.create.stepStory}</h2>

            <Field
              label={strings.create.language}
              hint={strings.create.languageHint}
              htmlFor="language"
            >
              <Select id="language" value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
                {catalogue.languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.flag ? `${language.flag}  ` : ''}
                    {language.nameNative}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <p className="mb-3 text-sm font-semibold text-ink">{strings.create.theme}</p>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {themes.map((theme) => {
                  const selected = theme.slug === themeSlug;
                  return (
                    <li key={theme.slug}>
                      <button
                        type="button"
                        onClick={() => setThemeSlug(theme.slug)}
                        className={cn(
                          'relative w-full overflow-hidden rounded-tile border px-3.5 py-3 text-left text-sm font-semibold transition-all',
                          selected
                            ? 'border-amber bg-amber-soft text-amber-deep shadow-page'
                            : 'border-line bg-paper-raised text-ink hover:border-line-strong',
                        )}
                      >
                        <span
                          className="mb-2 block size-2.5 rounded-pill"
                          style={{ background: theme.accentColor ?? 'var(--color-amber)' }}
                          aria-hidden="true"
                        />
                        {theme.label}
                        {theme.isPremium ? (
                          <Badge tone="plum" className="absolute right-2 top-2">
                            {strings.create.premiumBadge}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Field label={strings.create.objective} htmlFor="objective" optional={strings.common.optional}>
              <Select id="objective" value={objectiveSlug} onChange={(e) => setObjectiveSlug(e.target.value)}>
                <option value="">{strings.create.objectiveNone}</option>
                {objectives.map((objective) => (
                  <option key={objective.slug} value={objective.slug}>
                    {objective.label}
                  </option>
                ))}
              </Select>
            </Field>
          </section>
        ) : null}

        {/* ---- Step 3: the finishing touches ---------------------- */}
        {step === 2 ? (
          <section className="animate-rise space-y-8">
            <h2 className="font-display text-2xl font-bold text-ink">{strings.create.stepDetails}</h2>

            {costing.illustrationsEnabled ? (
              <div>
                <p className="mb-3 text-sm font-semibold text-ink">{strings.create.style}</p>
                <ul className="flex flex-wrap gap-2">
                  <li>
                    <StylePill
                      label={strings.create.styleNone}
                      selected={styleSlug === ''}
                      onClick={() => setStyleSlug('')}
                    />
                  </li>
                  {catalogue.styles.map((style) => (
                    <li key={style.slug}>
                      <StylePill
                        label={style.label}
                        selected={styleSlug === style.slug}
                        onClick={() => setStyleSlug(style.slug)}
                        premium={style.isPremium ? strings.create.premiumBadge : undefined}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="mb-3 text-sm font-semibold text-ink">{strings.create.length}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ['short', strings.create.lengthShort],
                    ['medium', strings.create.lengthMedium],
                    ['long', strings.create.lengthLong],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLength(value)}
                    className={cn(
                      'rounded-tile border px-3 py-3.5 text-center transition-all',
                      length === value
                        ? 'border-amber bg-amber-soft shadow-page'
                        : 'border-line bg-paper-raised hover:border-line-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'block text-sm font-bold',
                        length === value ? 'text-amber-deep' : 'text-ink',
                      )}
                    >
                      {label}
                    </span>
                    {/* The configured page count, not a sentence that has to
                        be re-translated when an administrator changes it. */}
                    <span className="mt-0.5 block text-[0.7rem] text-ink-faint">
                      {format(strings.create.lengthPages, { count: costing.pagesByLength[value] })}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={strings.create.customInstructions}
              htmlFor="custom"
              optional={strings.common.optional}
              hint={`${customInstructions.length} / ${HARD_LIMITS.maxCustomInstructionChars}`}
            >
              <Textarea
                id="custom"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value.slice(0, HARD_LIMITS.maxCustomInstructionChars))}
                placeholder={strings.create.customPlaceholder}
                rows={3}
              />
            </Field>

            <Field label={strings.create.dedication} htmlFor="dedication" optional={strings.common.optional}>
              <Input
                id="dedication"
                value={dedication}
                onChange={(e) => setDedication(e.target.value.slice(0, HARD_LIMITS.maxDedicationChars))}
                placeholder={strings.create.dedicationPlaceholder}
              />
            </Field>
          </section>
        ) : null}

        {/*
          The price, next to the button that spends it.

          The summary panel beside the wizard carries this on a laptop, but
          it is a grid sibling — on a phone it lands *after* the Create
          button, so the one number a parent wants before committing was
          the one thing below the fold. This is the same figure, in the
          place the decision is made.
        */}
        {step === 2 && canAfford ? (
          <p className="mt-9 flex items-baseline justify-between gap-4 rounded-tile bg-paper-sunken px-4 py-3 text-sm lg:hidden">
            <span className="text-ink-soft">{strings.create.costTitle}</span>
            <span className="font-bold text-ink">
              {estimate.total} {strings.common.credits}
            </span>
          </p>
        ) : null}

        {!canAfford ? (
          <div role="alert" className="mt-10 rounded-tile bg-rose-soft px-4 py-3.5 text-sm text-rose">
            <p className="font-semibold">
              {format(strings.create.notEnough, { needed: estimate.total, balance: creditBalance })}
            </p>
            <p className="mt-1 opacity-85">{strings.create.notEnoughHelp}</p>

            {/* An escape hatch rather than an upsell: there is nothing to
                buy yet, so the only honest help is the cheaper book they
                can actually afford tonight. */}
            {offerTextOnly ? (
              <Button variant="secondary" className="mt-3" onClick={() => setStyleSlug('')}>
                {format(strings.create.withoutPictures, { count: textOnly.total })}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* ---- Navigation ----------------------------------------- */}
        <div
          className={cn(
            'flex items-center justify-between gap-3',
            canAfford ? 'mt-10 lg:mt-10' : 'mt-5',
            step === 2 && canAfford ? 'mt-5 lg:mt-10' : null,
          )}
        >
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft />
            {strings.common.back}
          </Button>

          {step < 2 ? (
            <Button onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={!childId}>
              {strings.common.next}
              <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={pending || !canAfford}>
              {pending ? <Spinner /> : <Sparkles />}
              {pending ? strings.create.submitting : strings.create.submit}
            </Button>
          )}
        </div>

      </div>

      {/* ---- Summary ---------------------------------------------- */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-6">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-amber-deep">
            {strings.create.title}
          </p>

          <dl className="mt-5 space-y-3.5 text-sm">
            <SummaryRow label={strings.create.chooseChild} value={selectedChild?.nickname ?? selectedChild?.name} />
            <SummaryRow
              label={strings.create.language}
              value={catalogue.languages.find((l) => l.code === languageCode)?.nameNative}
            />
            <SummaryRow
              label={strings.create.theme}
              value={themes.find((t) => t.slug === themeSlug)?.label}
            />
            <SummaryRow
              label={strings.create.objective}
              value={
                objectives.find((o) => o.slug === objectiveSlug)?.label ??
                strings.create.objectiveNone
              }
            />
            <SummaryRow
              label={strings.create.style}
              value={catalogue.styles.find((s) => s.slug === styleSlug)?.label ?? strings.create.styleNone}
            />
            <SummaryRow
              label={strings.create.length}
              value={
                length === 'short'
                  ? strings.create.lengthShort
                  : length === 'medium'
                    ? strings.create.lengthMedium
                    : strings.create.lengthLong
              }
            />
          </dl>

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-ink-faint">
              {strings.create.costTitle}
            </p>

            <dl className="mt-3 space-y-2 text-sm">
              <CostRow label={strings.create.costText} value={estimate.text} />
              {illustrated ? (
                <CostRow
                  label={format(strings.create.costPictures, { count: estimate.imageCount })}
                  value={estimate.illustrations}
                  hint={strings.create.imagesNote}
                />
              ) : null}
              <div
                className={cn(
                  'flex items-baseline justify-between gap-4 border-t border-line pt-2 font-bold',
                  canAfford ? 'text-ink' : 'text-rose',
                )}
              >
                <dt>{strings.create.costTotal}</dt>
                <dd>{estimate.total}</dd>
              </div>
            </dl>

            <p className="mt-3 flex items-center justify-between gap-4 text-sm">
              <span className="text-ink-faint">
                {format(strings.common.creditsLeft, { count: creditBalance })}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-bold',
                  canAfford ? 'bg-amber-soft text-amber-deep' : 'bg-rose-soft text-rose',
                )}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {creditBalance}
              </span>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/**
 * Turns a failed action into a sentence in the parent's language.
 *
 * `error.message` is already parent-safe English written on the server,
 * which is right for the API and the logs and wrong for a Turkish parent
 * looking at a Turkish page. The one code whose numbers are worth reading
 * is re-rendered from `details`; everything else keeps the server's
 * wording rather than inventing a worse one.
 */
function messageFor(
  error: { code: string; message: string; details?: Record<string, unknown> },
  strings: { create: Dictionary['create'] },
): string {
  if (error.code === 'insufficient_credits') {
    const needed = error.details?.['needed'];
    const available = error.details?.['available'];
    if (typeof needed === 'number' && typeof available === 'number') {
      return format(strings.create.notEnough, { needed, balance: available });
    }
  }
  return error.message;
}

function CostRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">
        {label}
        {hint ? <span className="block text-[0.7rem] text-ink-faint">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 font-semibold text-ink">{value}</dd>
    </div>
  );
}

/**
 * Whether an option is written for a child of this age.
 *
 * Absent bounds mean "no opinion" rather than "nobody", so an option the
 * catalogue did not band is offered to everyone.
 */
function suitableFor(option: CatalogueOption, age: number | null): boolean {
  if (age === null || option.minAge === undefined) return true;
  return age >= option.minAge && age <= (option.maxAge ?? age);
}

function SummaryRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="truncate text-right font-semibold text-ink">{value ?? '—'}</dd>
    </div>
  );
}

function StylePill({
  label,
  selected,
  onClick,
  premium,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  premium?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-4 py-2.5 text-sm font-semibold transition-all',
        selected
          ? 'border-amber bg-amber-soft text-amber-deep'
          : 'border-line bg-paper-raised text-ink hover:border-line-strong',
      )}
    >
      {label}
      {premium ? <Badge tone="plum">{premium}</Badge> : null}
    </button>
  );
}
