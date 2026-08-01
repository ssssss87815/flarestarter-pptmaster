import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { localeHead } from '@/features/seo/seo'
import { getOrigin } from '@/features/seo/seo.fns'
import { getOptionalUser, getTurnstileSiteKey } from '@/features/auth/middleware'
import { PricingTable } from '@/features/billing/components/pricing-table'
import { SiteNav } from '@/components/marketing/site-nav'
import { Footer } from '@/components/marketing/footer'
import type { Locale } from '@/features/i18n/locale'

const rootRoute = getRouteApi('__root__')

export const Route = createFileRoute('/{-$locale}/pricing')({
  loader: async () => {
    const [origin, user, turnstileSiteKey] = await Promise.all([
      getOrigin(),
      getOptionalUser(),
      getTurnstileSiteKey(),
    ])
    return { origin, loggedIn: !!user, turnstileSiteKey }
  },
  head: ({ loaderData, params }) => {
    const origin = loaderData?.origin ?? ''
    const locale = ((params as { locale?: string }).locale ?? 'en') as Locale
    const { meta, links } = localeHead({
      origin,
      locale,
      path: '/pricing',
      title: locale === 'zh' ? '套餐 — PPTMaster' : 'Plans — PPTMaster',
      description:
        locale === 'zh'
          ? 'PPTMaster 免费 Beta 与专业生成套餐。'
          : 'PPTMaster Beta and professional presentation generation plans.',
    })
    return { meta, links }
  },
  component: Pricing,
})

function Pricing() {
  const { loggedIn, turnstileSiteKey } = Route.useLoaderData()
  const { theme } = rootRoute.useLoaderData()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav theme={theme} loggedIn={loggedIn} />
      <PricingTable turnstileSiteKey={turnstileSiteKey} />
      <Footer theme={theme} />
    </div>
  )
}
