import { DEFAULT_UI_LOCALE, type UiLocale } from '@/config/constants';

/**
 * The common answers, offered as taps instead of typing (§3).
 *
 * A child profile has six free-text lists on it. Typing all six on a
 * phone is the difference between "add a child" being a moment and being
 * a chore, and a parent who abandons the form halfway leaves us with a
 * profile too thin to personalise anything.
 *
 * These are *suggestions*, never a closed list: every field still accepts
 * anything typed into it, and a tapped chip is inserted as ordinary text
 * that can then be edited or deleted. Nothing here constrains what a
 * story can be about.
 *
 * **Localised strings, stored verbatim.** A parent choosing "dinozavrlar"
 * gets "dinozavrlar" on the profile and in the prompt, which is what they
 * typed as far as they are concerned. The model reads mixed-language
 * input without trouble, and the story's own language is a separate,
 * explicit setting (§13).
 *
 * Kept out of `Dictionary` deliberately: that type is flat maps of
 * strings, and its parity tests assume it. `tests/suggestions.test.ts`
 * enforces the equivalent guarantees here.
 *
 * Not in the database, because they are interface copy rather than
 * business configuration — the same category as a field label. If an
 * administrator ever needs to edit them without a deploy, they move to
 * `app_settings` like everything else in §18.
 */

export interface ChildSuggestions {
  interests: string[];
  favouriteAnimals: string[];
  favouriteActivities: string[];
  favouriteCharacters: string[];
  personalityTraits: string[];
  learningInterests: string[];
}

export type SuggestionField = keyof ChildSuggestions;

/**
 * Gender is the one field with a canonical value.
 *
 * Stored as `girl` / `boy` rather than the localised label, because it
 * reaches the prompt as a fact about the child and should read the same
 * whichever language the parent happens to use the app in. Empty is a
 * first-class answer: a story does not need to know.
 */
export const GENDER_VALUES = ['girl', 'boy'] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

const SUGGESTIONS: Record<UiLocale, ChildSuggestions> = {
  'en-US': {
    interests: [
      'dinosaurs',
      'space',
      'animals',
      'cars and trucks',
      'princesses',
      'pirates',
      'football',
      'music',
      'drawing',
      'robots',
    ],
    favouriteAnimals: [
      'cat',
      'dog',
      'rabbit',
      'horse',
      'lion',
      'elephant',
      'dolphin',
      'penguin',
      'bear',
      'butterfly',
    ],
    favouriteActivities: [
      'drawing',
      'dancing',
      'football',
      'swimming',
      'cycling',
      'building with blocks',
      'reading',
      'singing',
      'cooking together',
      'playing outside',
    ],
    favouriteCharacters: [
      'superheroes',
      'fairies',
      'dragons',
      'talking animals',
      'robots',
      'pirates',
      'princesses',
      'explorers',
      'detectives',
      'wizards',
    ],
    personalityTraits: [
      'kind',
      'curious',
      'funny',
      'brave',
      'shy',
      'full of energy',
      'gentle',
      'stubborn',
      'thoughtful',
      'cheerful',
    ],
    learningInterests: [
      'numbers',
      'letters',
      'the planets',
      'the sea',
      'the human body',
      'nature',
      'history',
      'how things work',
      'other countries',
      'feelings',
    ],
  },

  'az-AZ': {
    interests: [
      'dinozavrlar',
      'kosmos',
      'heyvanlar',
      'maşınlar',
      'şahzadələr',
      'dəniz quldurları',
      'futbol',
      'musiqi',
      'rəsm',
      'robotlar',
    ],
    favouriteAnimals: [
      'pişik',
      'it',
      'dovşan',
      'at',
      'aslan',
      'fil',
      'delfin',
      'pinqvin',
      'ayı',
      'kəpənək',
    ],
    favouriteActivities: [
      'rəsm çəkmək',
      'rəqs etmək',
      'futbol',
      'üzmək',
      'velosiped sürmək',
      'konstruktor yığmaq',
      'kitab oxumaq',
      'mahnı oxumaq',
      'birlikdə yemək bişirmək',
      'çöldə oynamaq',
    ],
    favouriteCharacters: [
      'super qəhrəmanlar',
      'pərilər',
      'əjdahalar',
      'danışan heyvanlar',
      'robotlar',
      'dəniz quldurları',
      'şahzadələr',
      'kəşfiyyatçılar',
      'dedektivlər',
      'sehrbazlar',
    ],
    personalityTraits: [
      'mehriban',
      'maraqlı',
      'gülməli',
      'cəsur',
      'utancaq',
      'enerjili',
      'həlim',
      'inadkar',
      'düşüncəli',
      'şən',
    ],
    learningInterests: [
      'rəqəmlər',
      'hərflər',
      'planetlər',
      'dəniz',
      'insan bədəni',
      'təbiət',
      'tarix',
      'əşyaların necə işlədiyi',
      'başqa ölkələr',
      'hisslər',
    ],
  },

  'ru-RU': {
    interests: [
      'динозавры',
      'космос',
      'животные',
      'машины',
      'принцессы',
      'пираты',
      'футбол',
      'музыка',
      'рисование',
      'роботы',
    ],
    favouriteAnimals: [
      'кошка',
      'собака',
      'кролик',
      'лошадь',
      'лев',
      'слон',
      'дельфин',
      'пингвин',
      'медведь',
      'бабочка',
    ],
    favouriteActivities: [
      'рисовать',
      'танцевать',
      'футбол',
      'плавать',
      'кататься на велосипеде',
      'строить из кубиков',
      'читать',
      'петь',
      'готовить вместе',
      'играть на улице',
    ],
    favouriteCharacters: [
      'супергерои',
      'феи',
      'драконы',
      'говорящие животные',
      'роботы',
      'пираты',
      'принцессы',
      'путешественники',
      'детективы',
      'волшебники',
    ],
    personalityTraits: [
      'добрый',
      'любознательный',
      'весёлый',
      'смелый',
      'застенчивый',
      'энергичный',
      'нежный',
      'упрямый',
      'вдумчивый',
      'жизнерадостный',
    ],
    learningInterests: [
      'цифры',
      'буквы',
      'планеты',
      'море',
      'тело человека',
      'природа',
      'история',
      'как всё устроено',
      'другие страны',
      'чувства',
    ],
  },

  'tr-TR': {
    interests: [
      'dinozorlar',
      'uzay',
      'hayvanlar',
      'arabalar',
      'prensesler',
      'korsanlar',
      'futbol',
      'müzik',
      'resim',
      'robotlar',
    ],
    favouriteAnimals: [
      'kedi',
      'köpek',
      'tavşan',
      'at',
      'aslan',
      'fil',
      'yunus',
      'penguen',
      'ayı',
      'kelebek',
    ],
    favouriteActivities: [
      'resim yapmak',
      'dans etmek',
      'futbol',
      'yüzmek',
      'bisiklete binmek',
      'bloklarla inşa etmek',
      'kitap okumak',
      'şarkı söylemek',
      'birlikte yemek yapmak',
      'dışarıda oynamak',
    ],
    favouriteCharacters: [
      'süper kahramanlar',
      'periler',
      'ejderhalar',
      'konuşan hayvanlar',
      'robotlar',
      'korsanlar',
      'prensesler',
      'kâşifler',
      'dedektifler',
      'büyücüler',
    ],
    personalityTraits: [
      'nazik',
      'meraklı',
      'komik',
      'cesur',
      'utangaç',
      'enerjik',
      'yumuşak huylu',
      'inatçı',
      'düşünceli',
      'neşeli',
    ],
    learningInterests: [
      'sayılar',
      'harfler',
      'gezegenler',
      'deniz',
      'insan vücudu',
      'doğa',
      'tarih',
      'eşyaların nasıl çalıştığı',
      'başka ülkeler',
      'duygular',
    ],
  },
};

/** Import-safe from a client component; no request context needed. */
export function getChildSuggestions(locale: UiLocale): ChildSuggestions {
  return SUGGESTIONS[locale] ?? SUGGESTIONS[DEFAULT_UI_LOCALE];
}

export const CHILD_SUGGESTIONS = SUGGESTIONS;
