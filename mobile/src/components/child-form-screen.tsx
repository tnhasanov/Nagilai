import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../session';
import { LOCALES, LOCALE_FLAGS, LOCALE_NAMES, useI18n } from '../i18n';
import { getChildSuggestions } from '../i18n/suggestions';
import { ApiError, type Catalogue, type ChildProfile } from '../api';
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ErrorNotice,
  Field,
  Heading,
  Loading,
  Screen,
  Title,
  spacing,
  usePalette,
} from './ui';

/*
 * The same warm palette as the website — the last two used to be
 * Tailwind's default blue and violet, the only cold colours in the
 * product. Named, so a swatch announces "Plum" rather than nothing.
 */
const PALETTE = [
  { value: '#4A3A6B', nameKey: 'childForm.colourPlum' },
  { value: '#D97E28', nameKey: 'childForm.colourAmber' },
  { value: '#4F7D5E', nameKey: 'childForm.colourSage' },
  { value: '#C4576B', nameKey: 'childForm.colourRose' },
  { value: '#B0611A', nameKey: 'childForm.colourClay' },
  { value: '#2B2119', nameKey: 'childForm.colourInk' },
] as const;

/**
 * Add a child (§3).
 *
 * The full profile, matching the website field for field. That parity is
 * the point: a profile created on a phone at 8pm should produce exactly as
 * personalised a story as one typed on a laptop, and a missing
 * "personality" is not a validation error anyone would notice -- it is
 * just a blander book, six weeks later, with no obvious cause.
 *
 * The list fields take comma-separated text rather than a tag widget: a
 * parent should be able to type "dinosaurs, digging, the moon" and move
 * on. The server splits, trims, de-duplicates and truncates.
 *
 * **There is no photograph upload, deliberately.** The appearance
 * *description* gives the illustrator the page-to-page consistency it
 * needs without Nagilai ever holding a picture of a child.
 */
/**
 * The child profile form, shared by the add and edit screens.
 *
 * Extracted from `app/child/new.tsx` when the audit found the children
 * list rendering cards with `accessibilityRole="button"` and no
 * `onPress` — the native app had no way to edit a child at all.
 */
export function ChildFormScreen({ childId }: { childId?: string }) {
  const { api } = useSession();
  const router = useRouter();
  const palette = usePalette();
  const { t, locale } = useI18n();
  const suggestions = getChildSuggestions(locale);

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<string>('');
  const [language, setLanguage] = useState<string>(locale);
  const [interests, setInterests] = useState('');
  const [animals, setAnimals] = useState('');
  const [activities, setActivities] = useState('');
  const [personality, setPersonality] = useState('');
  const [learning, setLearning] = useState('');
  const [appearance, setAppearance] = useState('');
  const [notes, setNotes] = useState('');
  const [colour, setColour] = useState<string>(PALETTE[0].value);

  const [loadingChild, setLoadingChild] = useState(Boolean(childId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .catalogue(locale)
      .then((next) => {
        setCatalogue(next);
        // Default the story language to the app's language: a parent
        // reading in Azerbaijani most likely wants an Azerbaijani book,
        // and it stays one tap to change.
        setLanguage((current) => {
          const matching = next.languages.find((option) => option.code === locale);
          return matching?.code ?? next.languages[0]?.code ?? current;
        });
      })
      .catch(() => undefined);
  }, [api, locale]);

  /* Editing: the API has no single-child read, so the profile comes from
     the same list the children screen shows. */
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;

    api.children
      .list()
      .then(({ children }) => {
        if (cancelled) return;
        const child = children.find((entry) => entry.id === childId);
        if (child) seed(child);
        setLoadingChild(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t('children.loadFailed'));
        setLoadingChild(false);
      });

    return () => {
      cancelled = true;
    };

    function seed(child: ChildProfile) {
      setName(child.name);
      setNickname(child.nickname ?? '');
      setAge(child.ageYears === null ? '' : String(child.ageYears));
      setGender(child.gender ?? '');
      setLanguage(child.preferredLanguage);
      setInterests(child.interests.join(', '));
      setAnimals(child.favouriteAnimals.join(', '));
      setActivities(child.favouriteActivities.join(', '));
      setPersonality(child.personalityTraits.join(', '));
      setLearning(child.learningInterests.join(', '));
      setAppearance(child.appearanceDescription ?? '');
      setNotes(child.parentNotes ?? '');
      if (child.avatarColor) setColour(child.avatarColor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, childId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFields({});

    try {
      const input = {
        name: name.trim(),
        nickname: nickname.trim(),
        ageYears: age.trim() === '' ? null : Number(age),
        gender,
        preferredLanguage: language,
        interests,
        favouriteAnimals: animals,
        favouriteActivities: activities,
        favouriteCharacters: '',
        personalityTraits: personality,
        learningInterests: learning,
        parentNotes: notes.trim(),
        appearanceDescription: appearance.trim(),
        avatarColor: colour,
      };

      if (childId) await api.children.update(childId, input);
      else await api.children.create(input);

      router.back();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError(t('childForm.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  }, [
    api,
    childId,
    name,
    nickname,
    age,
    gender,
    language,
    interests,
    animals,
    activities,
    personality,
    learning,
    notes,
    appearance,
    colour,
    router,
    t,
  ]);

  /**
   * Stored as the free text the story prompt reads, not as a code. The
   * unset option sends an empty string, which the prompt treats as
   * "avoid pronouns" rather than as a default.
   */
  const genderOptions: Array<{ value: string; label: string }> = [
    { value: 'girl', label: t('childForm.genderGirl') },
    { value: 'boy', label: t('childForm.genderBoy') },
    { value: 'neutral', label: t('childForm.genderNeutral') },
    { value: '', label: t('childForm.genderUnset') },
  ];

  if (loadingChild) return <Loading />;

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Title style={{ marginBottom: spacing.lg }}>
          {childId ? t('childForm.editTitle', { name: name || '…' }) : t('childForm.title')}
        </Title>

        {error ? <ErrorNotice message={error} /> : null}

        <Field
          label={t('childForm.name')}
          value={name}
          onChangeText={setName}
          hint={t('childForm.nameHint')}
          error={fields['name'] ?? null}
          maxLength={60}
        />

        <Field
          label={t('childForm.nickname')}
          value={nickname}
          onChangeText={setNickname}
          placeholder={t('common.optional')}
          hint={t('childForm.nicknameHint')}
          maxLength={60}
        />

        <Field
          label={t('childForm.age')}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          hint={t('childForm.ageHint')}
          error={fields['ageYears'] ?? null}
          maxLength={2}
        />

        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Body>{t('childForm.gender')}</Body>
          <Caption>{t('childForm.genderHint')}</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {genderOptions.map((option) => (
              <Chip
                key={option.value || 'unset'}
                label={option.label}
                selected={option.value === gender}
                onPress={() => setGender(option.value)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Body>{t('childForm.language')}</Body>
          <Caption>{t('childForm.languageHint')}</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {/* The four launch languages stand in when the catalogue
                cannot be fetched — this section used to render empty,
                with a hidden default silently set. */}
            {(
              catalogue?.languages ??
              LOCALES.map((code) => ({ code, nameNative: LOCALE_NAMES[code], flag: LOCALE_FLAGS[code] }))
            ).map((option) => (
              <Chip
                key={option.code}
                label={`${option.flag ?? ''} ${option.nameNative}`.trim()}
                selected={option.code === language}
                onPress={() => setLanguage(option.code)}
              />
            ))}
          </View>
        </View>

        <SuggestField
          label={t('childForm.interests')}
          value={interests}
          onChange={setInterests}
          hint={t('childForm.interestsHint')}
          suggestions={suggestions.interests}
        />

        <SuggestField
          label={t('childForm.animals')}
          value={animals}
          onChange={setAnimals}
          hint={t('childForm.animalsHint')}
          suggestions={suggestions.favouriteAnimals}
        />

        <SuggestField
          label={t('childForm.activities')}
          value={activities}
          onChange={setActivities}
          hint={t('childForm.activitiesHint')}
          suggestions={suggestions.favouriteActivities}
        />

        <SuggestField
          label={t('childForm.personality')}
          value={personality}
          onChange={setPersonality}
          hint={t('childForm.personalityHint')}
          suggestions={suggestions.personalityTraits}
        />

        <SuggestField
          label={t('childForm.learning')}
          value={learning}
          onChange={setLearning}
          hint={t('childForm.learningHint')}
          suggestions={suggestions.learningInterests}
        />

        <Field
          label={t('childForm.appearance')}
          value={appearance}
          onChangeText={setAppearance}
          placeholder={t('childForm.appearancePlaceholder')}
          hint={t('childForm.appearanceHint')}
          multiline
          numberOfLines={3}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
          maxLength={600}
        />

        <Card style={{ backgroundColor: palette.sageSoft, gap: 4, marginBottom: spacing.md }}>
          <Heading style={{ color: palette.sage }}>{t('childForm.noPhotoTitle')}</Heading>
          <Text style={{ color: palette.sage }}>{t('childForm.noPhotoBody')}</Text>
        </Card>

        <Field
          label={t('childForm.notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('common.optional')}
          hint={t('childForm.notesHint')}
          multiline
          numberOfLines={3}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
          maxLength={1000}
        />

        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <Body>{t('childForm.avatarColour')}</Body>
          <Caption>{t('childForm.avatarColourHint')}</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {PALETTE.map((entry) => (
              <Chip
                key={entry.value}
                label=" "
                accessibilityLabel={t(entry.nameKey)}
                accent={entry.value}
                selected={entry.value === colour}
                onPress={() => setColour(entry.value)}
              />
            ))}
          </View>
        </View>

        <Button
          label={t('childForm.save')}
          loading={saving}
          disabled={!name.trim()}
          onPress={save}
        />

        {childId ? (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={t('childForm.remove')}
              variant="danger"
              disabled={saving}
              onPress={() =>
                Alert.alert(t('childForm.remove'), t('childForm.removeConfirm'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('childForm.remove'),
                    style: 'destructive',
                    onPress: () => {
                      void api.children
                        .archive(childId)
                        .then(() => router.back())
                        .catch(() => setError(t('childForm.saveFailed')));
                    },
                  },
                ])
              }
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/**
 * A comma-separated list with the common answers already written down.
 *
 * The five list fields on this screen were bare text boxes, which on a
 * phone keyboard at bedtime is the difference between adding a child and
 * abandoning the form. Tapping a chip writes it into the field; the field
 * stays fully editable, so anything a parent wants to type still works.
 */
function SuggestField({
  label,
  value,
  onChange,
  hint,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint: string;
  suggestions: readonly string[];
}) {
  const chosen = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const chosenKeys = new Set(chosen.map((entry) => entry.toLocaleLowerCase()));

  function toggle(entry: string) {
    const key = entry.toLocaleLowerCase();
    const next = chosenKeys.has(key)
      ? chosen.filter((current) => current.toLocaleLowerCase() !== key)
      : [...chosen, entry];
    onChange(next.join(', '));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Field label={label} value={value} onChangeText={onChange} hint={hint} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {suggestions.map((entry) => (
          <Chip
            key={entry}
            label={entry}
            selected={chosenKeys.has(entry.toLocaleLowerCase())}
            onPress={() => toggle(entry)}
          />
        ))}
      </View>
    </View>
  );
}
