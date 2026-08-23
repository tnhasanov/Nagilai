/**
 * Localised book furniture (§13, §14).
 *
 * The printed book must be entirely in the story's language -- an
 * Azerbaijani book with an English "The End" on the last page is exactly
 * the kind of seam that makes a product feel machine-made.
 */
import type { BookStrings } from './book-renderer';

const STRINGS: Record<string, (childName: string) => BookStrings> = {
  'az-AZ': (name) => ({
    aStoryFor: name ? `${name} üçün bir nağıl` : 'Sənin üçün bir nağıl',
    createdWith: 'Nagilai ilə hazırlanıb',
    theEnd: 'Son',
    forGrownUps: 'Böyüklər üçün',
    talkAbout: 'Birlikdə danışın',
  }),
  'en-US': (name) => ({
    aStoryFor: name ? `A story for ${name}` : 'A story just for you',
    createdWith: 'Made with Nagilai',
    theEnd: 'The End',
    forGrownUps: 'For grown-ups',
    talkAbout: 'Things to talk about together',
  }),
  'ru-RU': (name) => ({
    aStoryFor: name ? `Сказка для ${name}` : 'Сказка для тебя',
    createdWith: 'Создано в Nagilai',
    theEnd: 'Конец',
    forGrownUps: 'Для взрослых',
    talkAbout: 'О чём поговорить вместе',
  }),
  'tr-TR': (name) => ({
    aStoryFor: name ? `${name} için bir masal` : 'Sana özel bir masal',
    createdWith: 'Nagilai ile hazırlandı',
    theEnd: 'Son',
    forGrownUps: 'Büyükler için',
    talkAbout: 'Birlikte konuşun',
  }),
};

export function bookStringsFor(languageCode: string, childName: string | null): BookStrings {
  const exact = STRINGS[languageCode];
  if (exact) return exact(childName ?? '');

  const base = languageCode.split('-')[0];
  const byLanguage = Object.entries(STRINGS).find(([code]) => code.split('-')[0] === base);
  if (byLanguage) return byLanguage[1](childName ?? '');

  return STRINGS['en-US']!(childName ?? '');
}
