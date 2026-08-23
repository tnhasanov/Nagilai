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
import { format } from '@/i18n';
import type { Dictionary } from '@/i18n';
import type { Catalogue } from '@/features/stories/catalogue';
import type { StoryLength } from '@/types/database';

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
  creditCost,
  creditBalance,
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
  creditCost: number;
  creditBalance: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const [childId, setChildId] = useState(childProfiles[0]?.id ?? '');
  const selectedChild = useMemo(
    () => childProfiles.find((child) => child.id === childId),
    [childProfiles, childId],
  );

  const [languageCode, setLanguageCode] = useState(
    childProfiles[0]?.preferredLanguage ?? catalogue.languages[0]?.code ?? 'en-US',
  );
  const [themeSlug, setThemeSlug] = useState(catalogue.themes[0]?.slug ?? 'adventure');
  const [objectiveSlug, setObjectiveSlug] = useState('');
  const [styleSlug, setStyleSlug] = useState(catalogue.styles[0]?.slug ?? 'storybook');
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
  const canAfford = creditBalance >= creditCost;

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
        toast.error(result.error.message);
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
                  'hidden text-sm font-semibold sm:block',
                  position === step ? 'text-ink' : 'text-ink-faint',
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
                {catalogue.themes.map((theme) => {
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
                {catalogue.objectives.map((objective) => (
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

            <div>
              <p className="mb-3 text-sm font-semibold text-ink">{strings.create.length}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ['short', strings.create.lengthShort, strings.create.lengthShortHint],
                    ['medium', strings.create.lengthMedium, strings.create.lengthMediumHint],
                    ['long', strings.create.lengthLong, strings.create.lengthLongHint],
                  ] as const
                ).map(([value, label, hint]) => (
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
                    <span className="mt-0.5 block text-[0.7rem] text-ink-faint">{hint}</span>
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

        {/* ---- Navigation ----------------------------------------- */}
        <div className="mt-10 flex items-center justify-between gap-3">
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

        {!canAfford ? (
          <p className="mt-4 rounded-tile bg-rose-soft px-4 py-3 text-sm font-medium text-rose">
            {format(strings.common.creditsLeft, { count: creditBalance })} —{' '}
            {format(strings.create.costNote, { count: creditCost })}
          </p>
        ) : null}
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
              value={catalogue.themes.find((t) => t.slug === themeSlug)?.label}
            />
            <SummaryRow
              label={strings.create.objective}
              value={
                catalogue.objectives.find((o) => o.slug === objectiveSlug)?.label ??
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

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
            <span className="font-semibold text-ink-soft">
              {format(strings.create.costNote, { count: creditCost })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber-soft px-2.5 py-1 font-bold text-amber-deep">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {creditBalance}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
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
