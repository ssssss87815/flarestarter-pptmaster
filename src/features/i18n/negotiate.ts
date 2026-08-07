import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { isLocale } from '@/features/i18n/locale'

/**
 * Browser-language negotiation for unprefixed (default-locale) paths.
 * Returns true when the visitor prefers zh and has not pinned a language via
 * the `locale` cookie (set by the language switcher). The route loader builds
 * the /zh redirect target from its own location (works on SSR and client nav).
 */
export const negotiateLocaleRedirectFn = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  const cookie = getRequestHeader('cookie') ?? ''
  const cookieLocale = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('locale='))
    ?.split('=')[1]
  if (isLocale(cookieLocale)) return false // user explicitly picked a language — respect it
  const accept = getRequestHeader('accept-language') ?? ''
  return accept.toLowerCase().includes('zh')
})
