import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { useI18n } from '../../src/i18n';
import { ApiError, type Catalogue } from '../../src/api';
import {
  Body,
  Button,
  Caption,
  Card,
  Chip,
  ErrorNotice,
  Field,
  Heading,
  Screen,
  Title,
  spacing,
  usePalette,
} from '../../src/components/ui';

const PALETTE = ['#4A3A6B', '#D97E28', '#4F7D5E', '#C4576B', '#3B82F6', '#8B5CF6'];

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
export default function NewChild() {
  const { api } = useSession();
  const router = useRouter();
  const palette = usePalette();
  const { t, locale } = useI18n();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<string>('');
  const [language, setLanguage] = useState('en-US');
  const [interests, setInterests] = useState('');
  const [animals, setAnimals] = useState('');
  const [activities, setActivities] = useState('');
  const [personality, setPersonality] = useState('');
  const [learning, setLearning] = useState('');
  const [appearance, setAppearance] = useState('');
  const [notes, setNotes] = useState('');
  const [colour, setColour] = useState(PALETTE[0]!);

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

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFields({});

    try {
      await api.children.create({
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
      });

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

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Title style={{ marginBottom: spacing.lg }}>{t('childForm.title')}</Title>

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
            {(catalogue?.languages ?? []).map((option) => (
              <Chip
                key={option.code}
                label={`${option.flag ?? ''} ${option.nameNative}`.trim()}
                selected={option.code === language}
                onPress={() => setLanguage(option.code)}
              />
            ))}
          </View>
        </View>

        <Field
          label={t('childForm.interests')}
          value={interests}
          onChangeText={setInterests}
          hint={t('childForm.interestsHint')}
        />

        <Field
          label={t('childForm.animals')}
          value={animals}
          onChangeText={setAnimals}
          hint={t('childForm.interestsHint')}
        />

        <Field
          label={t('childForm.activities')}
          value={activities}
          onChangeText={setActivities}
          hint={t('childForm.activitiesHint')}
        />

        <Field
          label={t('childForm.personality')}
          value={personality}
          onChangeText={setPersonality}
          hint={t('childForm.personalityHint')}
        />

        <Field
          label={t('childForm.learning')}
          value={learning}
          onChangeText={setLearning}
          hint={t('childForm.learningHint')}
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
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {PALETTE.map((value) => (
              <Chip
                key={value}
                label=" "
                accent={value}
                selected={value === colour}
                onPress={() => setColour(value)}
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
      </ScrollView>
    </Screen>
  );
}
