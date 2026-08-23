import 'server-only';

import { cookies, headers } from 'next/headers';
import { DEFAULT_UI_LOCALE, isUiLocale, LOCALE_COOKIE, type UiLocale } from '@/config/constants';
import { negotiateLocale } from './index';

/**
 * Resolves the interface locale for the current request: an explicit
 * cookie first, then the browser's Accept-Language, then English.
 *
 * Separate from `@/i18n` because it touches `next/headers`, which a client
 * component may not import — the dictionaries themselves must stay
 * reachable from both sides.
 */
export async function resolveLocale(): Promise<UiLocale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isUiLocale(fromCookie)) return fromCookie;

  const headerList = await headers();
  return negotiateLocale(headerList.get('accept-language')) ?? DEFAULT_UI_LOCALE;
}
